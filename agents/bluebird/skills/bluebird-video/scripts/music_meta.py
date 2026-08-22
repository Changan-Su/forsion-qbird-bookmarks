#!/usr/bin/env python3
"""青鸟收藏夹 · 音乐剪藏 (Bluebird music_meta)

音乐链接 -> 一条收藏所需的全部信息。**不下载音频、不做语音识别** —— 歌词是现成的
ground truth,拿官方接口的 LRC 比 ASR 转唱歌准得多也快得多。

支持:网易云音乐(music.163.com / 163cn.tv)、QQ 音乐(y.qq.com)、Apple Music(music.apple.com)。
Apple Music 走公开的 iTunes Lookup —— 只有元数据,**没有歌词也没有评论**(苹果没这两个公开接口)。

输出:一行 JSON 到 stdout ——
  {"ok":true,"source":"music","meta":{...},"lyrics":[{start,end,text}],"intro":"","comments":[{user,likes,text}]}
出错:错误信息到 stderr,退出码 1(便于 run_bash 判定失败)。

用法:
  python3 music_meta.py <音乐链接>
  python3 music_meta.py --selftest     # 纯解析逻辑自检,不联网

只认**单曲**链接。专辑/歌单/电台链接会明确报错 —— 收藏的单位是一首歌。
"""
import json
import re
import sys
import urllib.parse
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)
TIMEOUT = 15
HOT_COMMENTS = 5


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def http_json(url, referer=None):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": referer or url,
        "Accept": "application/json, text/plain, */*",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        raw = resp.read()
    # QQ 的部分接口回 GB2312/GBK,utf-8 解不出来时退一档
    for enc in ("utf-8", "gbk"):
        try:
            return json.loads(raw.decode(enc, "strict"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    return json.loads(raw.decode("utf-8", "replace"))


def resolve_redirect(url):
    """展开分享短链(163cn.tv 之类),拿最终地址。"""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.geturl()


# ── URL 识别 ────────────────────────────────────────────────────────────────

def parse_url(url):
    """→ (platform, id, country)。认不出返回 (None, None, None)。

    网易云的 `#/song?id=` 是 hash 路由,urlparse 会把它整段丢进 fragment,
    所以一律用正则从原串里抠,别走 parse_qs。
    """
    u = str(url or "").strip()

    if "music.163.com" in u:
        # 歌单/专辑链接同样带 ?id=,得先拦 —— 否则会拿歌单 id 去查歌,报出「这首歌下架了」这种误导消息
        if re.search(r"/(album|playlist|artist|djradio|program)\b", u):
            die("网易云:这是专辑/歌单/电台链接,青鸟收藏的单位是单曲,请给单曲链接")
        m = re.search(r"[?&#/]id=(\d+)", u) or re.search(r"/song/(\d+)", u)
        if m:
            return "netease", m.group(1), None
        die("网易云:链接里没有歌曲 id")

    if "y.qq.com" in u or "c.y.qq.com" in u:
        m = (re.search(r"songDetail/([\w]+)", u)
             or re.search(r"/song/([\w]+)\.html", u)
             or re.search(r"[?&]songmid=([\w]+)", u))
        if m:
            return "qqmusic", m.group(1), None
        if re.search(r"(albumDetail|playlist|singer|toplist)", u):
            die("QQ 音乐:这是专辑/歌单链接,青鸟收藏的单位是单曲,请给单曲链接")
        die("QQ 音乐:链接里没有歌曲 mid")

    if "music.apple.com" in u:
        cc = "us"
        mcc = re.search(r"music\.apple\.com/([a-z]{2})/", u)
        if mcc:
            cc = mcc.group(1)
        m = re.search(r"[?&]i=(\d+)", u) or re.search(r"/song/[^/]*/(\d+)", u)
        if m:
            return "applemusic", m.group(1), cc
        if "/album/" in u:
            die("Apple Music:这是整张专辑的链接,请点单曲的分享链接(带 ?i= 的那种)")
        die("Apple Music:链接里没有单曲 id")

    return None, None, None


# ── LRC → segments ──────────────────────────────────────────────────────────

LRC_LINE = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")
LRC_TAIL_GAP = 5.0  # 最后一行没有下一行给终点,给个尾巴

def parse_lrc(text):
    """LRC → [{start,end,text}]。end 取下一行的 start(LRC 本身只有起点)。

    `[ti:][ar:][al:][by:][offset:]` 这类头部标签不是歌词,丢掉。
    """
    out = []
    for line in str(text or "").splitlines():
        stamps = LRC_LINE.findall(line)
        if not stamps:
            continue
        body = LRC_LINE.sub("", line).strip()
        if not body:
            continue
        for mm, ss, frac in stamps:  # 一行可以挂多个时间戳(重复句)
            # 小数点后当十进制小数读:.93=0.93s / .5=0.5s / .930=0.93s
            ms = int(frac) / (10.0 ** len(frac)) if frac else 0.0
            out.append({"start": int(mm) * 60 + int(ss) + ms, "end": 0.0, "text": body})
    out.sort(key=lambda s: s["start"])
    for i, seg in enumerate(out):
        seg["end"] = out[i + 1]["start"] if i + 1 < len(out) else seg["start"] + LRC_TAIL_GAP
    return out


def strip_html(text):
    return re.sub(r"<[^>]+>", "", str(text or "")).strip()


def strip_emoji_codes(text):
    """QQ 评论里的 [em]e401236[/em] 表情码,收藏进笔记就是乱码,去掉。"""
    return re.sub(r"\[/?em\]|e\d{6}", "", str(text or "")).strip()


# ── 网易云 ──────────────────────────────────────────────────────────────────

NETEASE_REF = "https://music.163.com"

def fetch_netease(song_id):
    detail = http_json(
        "https://music.163.com/api/song/detail?ids=%s" % urllib.parse.quote("[%s]" % song_id),
        NETEASE_REF)
    songs = detail.get("songs") or []
    if not songs:
        die("网易云:没找到这首歌(id=%s),可能已下架" % song_id)
    s = songs[0]
    album = s.get("album") or {}
    meta = {
        "platform": "netease",
        "songId": str(song_id),
        "title": s.get("name") or "",
        "author": " / ".join(a.get("name", "") for a in (s.get("artists") or []) if a.get("name")),
        "album": album.get("name") or "",
        "duration": round((s.get("duration") or 0) / 1000.0),  # 接口给毫秒
        "thumbnail": album.get("picUrl") or "",
        "releaseDate": "",
        "webpageUrl": "https://music.163.com/song?id=%s" % song_id,
    }
    alias = s.get("alias") or []
    if alias:
        meta["subtitle"] = alias[0]

    lyrics = []
    try:
        lrc = http_json("https://music.163.com/api/song/lyric?id=%s&lv=1&tv=-1" % song_id, NETEASE_REF)
        lyrics = parse_lrc((lrc.get("lrc") or {}).get("lyric"))
    except Exception:
        pass  # 纯音乐 / 接口抽风:歌词缺了不该整条失败

    # 专辑简介/发行日 song/detail 里就带了 —— 别再打 /api/album/(常被风控挡 code -462)
    intro = strip_html(album.get("description") or album.get("briefDesc") or "")
    if album.get("publishTime"):
        meta["releaseDate"] = ms_to_date(album["publishTime"])

    comments = []
    try:
        cm = http_json(
            "https://music.163.com/api/v1/resource/comments/R_SO_4_%s?limit=%d" % (song_id, HOT_COMMENTS),
            NETEASE_REF)
        for c in (cm.get("hotComments") or [])[:HOT_COMMENTS]:
            comments.append({
                "user": ((c.get("user") or {}).get("nickname")) or "",
                "likes": c.get("likedCount") or 0,
                "text": (c.get("content") or "").strip(),
            })
    except Exception:
        pass

    return meta, lyrics, intro, comments


def ms_to_date(ms):
    import datetime
    try:
        return datetime.datetime.fromtimestamp(int(ms) / 1000.0, datetime.timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OSError, OverflowError):
        return ""


# ── QQ 音乐 ─────────────────────────────────────────────────────────────────

QQ_REF = "https://y.qq.com/"

def fetch_qqmusic(mid):
    info = http_json(
        "https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=%s&format=json&platform=yqq" % mid,
        QQ_REF)
    data = info.get("data") or []
    if not data:
        die("QQ 音乐:没找到这首歌(mid=%s)" % mid)
    s = data[0]
    album = s.get("album") or {}
    meta = {
        "platform": "qqmusic",
        "songId": mid,
        "title": s.get("title") or s.get("name") or "",
        "author": " / ".join(a.get("name", "") for a in (s.get("singer") or []) if a.get("name")),
        "album": album.get("name") or album.get("title") or "",
        "duration": int(s.get("interval") or 0),  # 接口给秒
        "thumbnail": ("https://y.qq.com/music/photo_new/T002R500x500M000%s.jpg" % album["mid"]) if album.get("mid") else "",
        "releaseDate": album.get("time_public") or "",
        "webpageUrl": "https://y.qq.com/n/ryqq/songDetail/%s" % mid,
    }
    if s.get("subtitle"):
        meta["subtitle"] = s["subtitle"]

    lyrics = []
    try:
        lrc = http_json(
            "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=%s&format=json&nobase64=1" % mid,
            QQ_REF)
        lyrics = parse_lrc(lrc.get("lyric"))
    except Exception:
        pass

    comments = []
    topid = s.get("id")
    if topid:
        try:
            cm = http_json(
                "https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg"
                "?g_tk=5381&format=json&inCharset=utf8&outCharset=utf8&platform=yqq"
                # ponytail: cid/reqtype/cmd 是这个 h5 接口的固定魔数,照抄即可
                "&cid=205360772&reqtype=2&biztype=1&cmd=8&needmusiccrit=0&pagenum=0"
                "&topid=%s&pagesize=%d" % (topid, HOT_COMMENTS),
                QQ_REF)
            # 热评在 hot_comment(带下划线);没有热评的冷门歌退回最新评论
            lst = ((cm.get("hot_comment") or {}).get("commentlist")
                   or (cm.get("comment") or {}).get("commentlist") or [])
            for c in lst:
                text = strip_emoji_codes(c.get("rootcommentcontent"))
                if not text:   # 纯表情的评论剥完就空了
                    continue
                comments.append({"user": c.get("nick") or "", "likes": c.get("praisenum") or 0, "text": text})
                if len(comments) >= HOT_COMMENTS:
                    break
        except Exception:
            pass

    return meta, lyrics, "", comments


# ── Apple Music(iTunes Lookup,公开免鉴权;没有歌词/评论接口) ──────────────

def fetch_applemusic(track_id, country):
    res = http_json("https://itunes.apple.com/lookup?id=%s&country=%s&entity=song" % (track_id, country or "us"))
    hits = [r for r in (res.get("results") or []) if r.get("wrapperType") == "track"] or (res.get("results") or [])
    if not hits:
        die("Apple Music:没找到这首歌(id=%s,区域=%s),换个区域的链接试试" % (track_id, country))
    r = hits[0]
    art = r.get("artworkUrl100") or r.get("artworkUrl60") or ""
    meta = {
        "platform": "applemusic",
        "songId": str(track_id),
        "title": r.get("trackName") or "",
        "author": r.get("artistName") or "",
        "album": r.get("collectionName") or "",
        "duration": round((r.get("trackTimeMillis") or 0) / 1000.0),  # 接口给毫秒
        "thumbnail": re.sub(r"/\d+x\d+bb", "/600x600bb", art),
        "releaseDate": (r.get("releaseDate") or "")[:10],
        "genre": r.get("primaryGenreName") or "",
        "webpageUrl": r.get("trackViewUrl") or "",
    }
    # 苹果没有公开的歌词/评论接口 —— 缺了就如实缺,不编。
    return meta, [], "", []


# ── main ────────────────────────────────────────────────────────────────────

FETCHERS = {"netease": fetch_netease, "qqmusic": fetch_qqmusic}

def run(url):
    platform, ident, country = parse_url(url)
    if not platform and re.match(r"^https?://", str(url or "")):
        try:
            url = resolve_redirect(url)  # 163cn.tv 这类分享短链
        except Exception as exc:
            die("链接展开失败:%s" % exc)
        platform, ident, country = parse_url(url)
    if not platform:
        die("不是支持的音乐链接(网易云 music.163.com / QQ 音乐 y.qq.com / Apple Music music.apple.com)")

    if platform == "applemusic":
        meta, lyrics, intro, comments = fetch_applemusic(ident, country)
    else:
        meta, lyrics, intro, comments = FETCHERS[platform](ident)

    return {"ok": True, "source": "music", "meta": meta,
            "lyrics": lyrics, "intro": intro, "comments": comments}


def selftest():
    cases = [
        ("https://music.163.com/#/song?id=1330348068", ("netease", "1330348068")),
        ("https://music.163.com/song?id=25906124", ("netease", "25906124")),
        ("https://y.qq.com/n/ryqq/songDetail/004Z8Ihr0JIu5s", ("qqmusic", "004Z8Ihr0JIu5s")),
        ("https://y.qq.com/n/yqq/song/004Z8Ihr0JIu5s.html", ("qqmusic", "004Z8Ihr0JIu5s")),
        ("https://music.apple.com/cn/album/x/1444818058?i=1444818070", ("applemusic", "1444818070")),
        ("https://music.apple.com/us/song/hey-jude/1441133101", ("applemusic", "1441133101")),
    ]
    for url, want in cases:
        got = parse_url(url)[:2]
        assert got == want, "%s → %s,期望 %s" % (url, got, want)
    assert parse_url("https://example.com/x")[0] is None
    import contextlib, io
    for bad_url in ("https://music.163.com/#/playlist?id=123", "https://music.163.com/#/album?id=1"):
        try:                                  # 歌单/专辑要拦在前面,别当成歌曲 id 去查
            with contextlib.redirect_stderr(io.StringIO()):   # die() 的提示不该污染自检输出
                parse_url(bad_url)
            assert False, "%s 应被拒" % bad_url
        except SystemExit:
            pass

    segs = parse_lrc("[ti:七里香]\n[00:00.00]词:方文山\n[00:06.93]窗外的麻雀\n[01:02.5]吵醒沉睡")
    assert len(segs) == 3, segs                       # ti: 标签不算歌词
    assert segs[0]["text"] == "词:方文山"
    assert abs(segs[1]["start"] - 6.93) < 0.01, segs[1]
    assert abs(segs[1]["end"] - 62.5) < 0.01, segs[1]  # end = 下一行的 start
    assert abs(segs[2]["end"] - (62.5 + LRC_TAIL_GAP)) < 0.01
    assert parse_lrc("") == []
    assert parse_lrc("[00:01.0]   ") == []             # 空行不入

    assert ms_to_date(1093046400000) == "2004-08-21"
    assert ms_to_date("坏值") == ""
    assert strip_html("<p>专辑<br/>简介</p>") == "专辑简介"
    assert strip_emoji_codes("七里香[em]e401236[/em]真好听") == "七里香真好听"
    assert strip_emoji_codes("回忆过去[em]e400828") == "回忆过去"
    print("selftest ok")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        die("用法:music_meta.py <音乐链接> | --selftest")
    if sys.argv[1] == "--selftest":
        selftest()
    else:
        try:
            print(json.dumps(run(sys.argv[1]), ensure_ascii=False))
        except SystemExit:
            raise
        except Exception as exc:
            die("抓取失败:%s" % exc)
