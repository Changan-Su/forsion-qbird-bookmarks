#!/usr/bin/env python3
"""青鸟收藏夹 · 统一转录 (Bluebird transcribe)

URL -> 转录文本。策略:先用 yt-dlp 取原生/自动字幕(适用任意 yt-dlp 支持的站点:
YouTube / Bilibili / 抖音 / 小红书 …)。**无字幕不在这里转写** —— 抠出 16kHz 单声道 WAV
并交出路径,由 Forsion 桌面自己的语音链路(设置 → 语音:本地 SenseVoice 离线 / 自带 key
的 provider / Forsion 云)去转。脚本不自带 ASR 供应商,也就不需要第二个 key。
字幕路径无需 ffmpeg;交音频那条需要 ffmpeg 才能转 WAV。

输出:一行 JSON 到 stdout ——
  有字幕: {"ok":true,"source":"native","meta":{...},"text":...,"segments":[...]}
  无字幕: {"ok":true,"source":"needs_asr","meta":{...},"audio_path":"/tmp/....wav"}
出错:错误信息到 stderr,退出码 1(便于 run_bash 判定失败)。

环境变量(全部可选):
  BLUEBIRD_COOKIE     平台 Cookie(B站高清/会员、需要登录的内容)
  BLUEBIRD_UA         User-Agent(缺省给一个桌面 Chrome UA)
  BLUEBIRD_LANGS      字幕语言优先级,逗号分隔(缺省 zh-Hans,zh-CN,zh,en,en-US)

用法:
  python transcribe.py <video_url>
  python transcribe.py --selftest      # 纯解析逻辑自检,不联网

注:字幕解析逻辑照搬 Bluebird 的 youtube_downloader.py(经实战验证)。
"""
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)


# ── 字幕解析(照搬 youtube_downloader.py) ──────────────────────────────────

def vtt_time_to_seconds(time_str):
    parts = time_str.split(":")
    if len(parts) == 3:
        h, m, sec = int(parts[0]), int(parts[1]), parts[2]
    else:  # 无小时位 mm:ss.mmm
        h, m, sec = 0, int(parts[0]), parts[1]
    s_parts = sec.split(".")
    s, ms = int(s_parts[0]), int(s_parts[1])
    return h * 3600 + m * 60 + s + ms / 1000.0


def parse_json3_subtitles(path):
    segments = []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for event in data.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        text = "".join(s.get("utf8", "") for s in segs).strip()
        if not text or text == "\n":
            continue
        start_ms = event.get("tStartMs", 0)
        duration_ms = event.get("dDurationMs", 0)
        segments.append({
            "start": start_ms / 1000.0,
            "end": (start_ms + duration_ms) / 1000.0,
            "text": text,
        })
    return segments


def parse_srv_subtitles(path):
    segments = []
    root = ET.parse(str(path)).getroot()
    for p in root.iter("p"):
        text = "".join(p.itertext()).strip()
        if not text:
            continue
        t = int(p.get("t", "0"))
        d = int(p.get("d", "0"))
        segments.append({"start": t / 1000.0, "end": (t + d) / 1000.0, "text": text})
    return segments


def parse_vtt_subtitles(path):
    segments = []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    return parse_vtt_text(content)


def parse_vtt_text(content):
    """WebVTT 文本 → 段。抽出成纯函数便于自检。兼容 CRLF 换行与无小时位(mm:ss.mmm)时间戳。"""
    segments = []
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    ts = r"(?:\d{2}:)?\d{2}:\d{2}\.\d{3}"
    pattern = re.compile(r"(" + ts + r")\s*-->\s*(" + ts + r")")
    for block in content.split("\n\n"):
        match = pattern.search(block)
        if not match:
            continue
        start_str, end_str = match.group(1), match.group(2)
        text_lines = []
        found_ts = False
        for line in block.split("\n"):
            if found_ts:
                stripped = re.sub(r"<[^>]+>", "", line).strip()
                if stripped:
                    text_lines.append(stripped)
            elif pattern.search(line):
                found_ts = True
        text = " ".join(text_lines).strip()
        if not text:
            continue
        segments.append({
            "start": vtt_time_to_seconds(start_str),
            "end": vtt_time_to_seconds(end_str),
            "text": text,
        })
    return segments


def extract_subtitles(info, work_dir, lang_priority, headers=None):
    """从 yt-dlp info 里挑一条字幕轨(优先手工上传,其次自动生成;语言按 lang_priority)。下载带 Cookie/UA 头。"""
    for source in [info.get("subtitles") or {}, info.get("automatic_captions") or {}]:
        if not source:
            continue
        chosen_lang = next((l for l in lang_priority if l in source), None)
        if not chosen_lang:
            chosen_lang = next(iter(source), None)
        if not chosen_lang:
            continue
        formats = source[chosen_lang]
        chosen = next((f for f in formats if f.get("ext") in ("json3", "srv3")), None) \
            or next((f for f in formats if f.get("ext") == "vtt"), None) \
            or (formats[0] if formats else None)
        if not chosen or "url" not in chosen:
            continue
        ext = chosen.get("ext", "vtt")
        sub_path = work_dir / f"subs.{ext}"
        try:
            req = urllib.request.Request(chosen["url"], headers=headers or {})
            with urllib.request.urlopen(req, timeout=60) as resp:
                sub_path.write_bytes(resp.read())
            if ext == "json3":
                segs = parse_json3_subtitles(sub_path)
            elif ext in ("srv3", "srv2", "srv1"):
                segs = parse_srv_subtitles(sub_path)
            else:
                segs = parse_vtt_subtitles(sub_path)
            if segs:
                return segs, chosen_lang
        except Exception:
            continue
    return [], None


# ── 无字幕 → 交给 Forsion 的语音识别链路 ────────────────────────────────────
# 这里刻意**不做转写**:Forsion 桌面自带一整条语音链(本地 SenseVoice 离线 → 自带 key 的
# provider → Forsion 云),用户在「设置 → 语音」里已经选好了。脚本再自带一个 ASR 供应商 =
# 第二套配置、第二个 key、第二份账单。故只负责把音频抠成 16k 单声道 WAV 并交出路径。

def download_audio(url, work_dir, headers):
    """下载 bestaudio 转 **16kHz 单声道 WAV**(需 ffmpeg)。

    为什么固定 16k/mono/WAV:本地 SenseVoice 就吃这个采样率,且宿主是自己解析 WAV 头
    (不经 sherpa readWave)—— 交别的编码等于让它多绕一道转码。云端那条也照收 WAV。
    """
    from yt_dlp import YoutubeDL
    opts = {
        "outtmpl": str(work_dir / "audio.%(ext)s"),
        "format": "ba/b",
        "quiet": True,
        "noprogress": True,
        "noplaylist": True,
        "socket_timeout": 300,
        "retries": 3,
        "fragment_retries": 3,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
        "postprocessor_args": {"extractaudio": ["-ar", "16000", "-ac", "1"]},
        "http_headers": headers,
        # 转 wav 后别删原件:那份压缩音频才是要存进收藏夹的(wav 是 16k 单声道降质版,一小时 100MB+)
        "keepvideo": True,
    }
    with YoutubeDL(opts) as ydl:
        ydl.extract_info(url, download=True)
    audio = work_dir / "audio.wav"
    if not audio.exists():
        for item in sorted(work_dir.iterdir()):
            # keepvideo 之后目录里有两份,这里挑的是**喂语音识别**的那份:wav 优先
            if item.suffix.lower() in (".wav", ".mp3", ".m4a", ".opus", ".webm", ".ogg"):
                audio = item
                if item.suffix.lower() == ".wav":
                    break
    if not audio.exists():
        raise RuntimeError("音频下载成功但找不到文件(ffmpeg 是否可用?)")
    return audio


# ── 存档:把素材落进收藏夹(--save-to,给的是绝对目录) ─────────────────────────

AUDIO_EXTS = (".wav", ".mp3", ".m4a", ".opus", ".webm", ".ogg", ".aac", ".flac")
MAX_IMAGE_BYTES = 20 * 1024 * 1024
CONTENT_TYPE_EXT = {
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/gif": ".gif", "image/avif": ".avif", "image/bmp": ".bmp",
}


def safe_stem(text):
    """文件名词干:id 来自 yt-dlp,字符集不由我们说了算 —— 一个 `/` 就是一次目录穿越。"""
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", str(text or "")).strip("_")
    return cleaned[:60] or "item"


def image_ext(content_type, url):
    """扩展名决定 Amadeus 认不认它是图(IMG_EXT_RE),所以优先信 Content-Type,再退 URL 后缀。"""
    ext = CONTENT_TYPE_EXT.get(str(content_type or "").split(";")[0].strip().lower())
    if ext:
        return ext
    m = re.search(r"\.(jpe?g|png|webp|gif|avif|bmp)(?:[?!#]|$)", str(url or ""), re.I)
    return ("." + m.group(1).lower().replace("jpeg", "jpg")) if m else ".jpg"


def pick_archive_audio(names):
    """keepvideo 之后 work_dir 里有两份:转好的 audio.wav(给语音识别)和原始压缩音频(给存档)。
    存档要的是**非 wav 的那份** —— wav 是 16k 单声道的降质版,一小时能有 100MB+。"""
    for name in sorted(names):
        low = name.lower()
        if low.endswith(".wav"):
            continue
        if low.endswith(AUDIO_EXTS) or low.endswith((".mp4", ".m4v", ".mov")):
            return name
    return None


def download_images(urls, save_dir, stem, headers):
    """图片逐张下,**一张挂掉不许拖垮整条**(帖子里少一张图 ≫ 整篇剪藏失败)。回落盘的文件名。"""
    out = []
    save_dir.mkdir(parents=True, exist_ok=True)
    for idx, url in enumerate(urls, 1):
        try:
            hdrs = dict(headers)
            if "xhscdn" in url or "xiaohongshu" in url:
                hdrs.setdefault("Referer", "https://www.xiaohongshu.com/")
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=60) as resp:
                blob = resp.read(MAX_IMAGE_BYTES + 1)
                ctype = resp.headers.get("Content-Type", "")
            if not blob or len(blob) > MAX_IMAGE_BYTES:
                continue
            name = "%s-%02d%s" % (stem, idx, image_ext(ctype, url))
            (save_dir / name).write_bytes(blob)
            out.append(name)
        except Exception as exc:
            print("图片 %d 存档失败(跳过):%s" % (idx, exc), file=sys.stderr)
    return out


# ── 图文帖(小红书笔记这类没有音轨的帖子) ────────────────────────────────────

# yt-dlp 对图文帖常直接抛而不是回一个「没有流」的 info,这两句是它的形态(照搬 xiaohongshu_extractor 的实战判据)
IMAGE_POST_ERRORS = ("no video formats", "unable to extract")


def is_image_post_error(exc):
    msg = str(exc).lower()
    return any(k in msg for k in IMAGE_POST_ERRORS)


def dedupe_thumbnails(info):
    """yt-dlp 对同一张图会回多条(urlDefault / urlPre 各一)。
    去掉 `?` 查询串与 CDN 的 `!变换后缀`,拿最后一段路径当键去重。"""
    seen, out = set(), []
    for t in (info.get("thumbnails") or []):
        if not isinstance(t, dict) or not t.get("url"):
            continue
        url = t["url"]
        base = url.split("?")[0].split("!")[0]
        key = base.split("/")[-1] if "/" in base else base
        if key not in seen:
            seen.add(key)
            out.append(url)
    return out


def image_post_result(info, fallback_url, save_dir=None, headers=None):
    """图文帖:图 + 正文就是全部内容,没有音轨可转写。"""
    images = dedupe_thumbnails(info)
    meta = build_meta(info, fallback_url)
    meta["images"] = images
    if not meta["thumbnail"] and images:
        meta["thumbnail"] = images[0]          # 侧栏/详情的封面位照常有东西可显
    out = {"ok": True, "source": "image_text", "meta": meta,
           "text": str(info.get("description") or "").strip(),
           "note": "图文帖:没有音轨,图片与正文已抓好,不需要转写"}
    if save_dir and images:
        out["assets"] = download_images(images, Path(save_dir),
                                        "bluebird-" + safe_stem(meta.get("videoId")), headers or {})
    return out


def build_meta(info, fallback_url):
    return {
        "videoId": str(info.get("id") or "").strip(),
        "title": str(info.get("title") or "视频").strip(),
        "author": str(info.get("uploader") or info.get("channel") or info.get("uploader_id") or "").strip(),
        "duration": int(info.get("duration") or 0),
        "webpageUrl": str(info.get("webpage_url") or fallback_url).strip(),
        "thumbnail": str(info.get("thumbnail") or "").strip(),
    }


def run(url, save_to=None):
    from yt_dlp import YoutubeDL
    langs = [s.strip() for s in os.environ.get(
        "BLUEBIRD_LANGS", "zh-Hans,zh-CN,zh,en,en-US").split(",") if s.strip()]
    headers = {"User-Agent": os.environ.get("BLUEBIRD_UA", "").strip() or DEFAULT_UA}
    if os.environ.get("BLUEBIRD_COOKIE", "").strip():
        headers["Cookie"] = os.environ["BLUEBIRD_COOKIE"].strip()
    work_dir = Path(tempfile.mkdtemp(prefix="bluebird_"))
    probe_opts = {"quiet": True, "noprogress": True, "noplaylist": True,
                  "http_headers": headers, "skip_download": True,
                  # 图文帖没有流,不加这个 flag yt-dlp 直接抛 `No video formats found` ——
                  # 加上则退成 warning 并照常回 info(缩略图/正文/时长都在)。web 版一直有,原生化时漏了。
                  "ignore_no_formats_error": True}
    try:
        try:
            with YoutubeDL(probe_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as exc:
            # 图文帖没有视频流,yt-dlp 常在这一步就抛 —— 退成不解析流的元数据抽取
            if not is_image_post_error(exc):
                raise
            with YoutubeDL(probe_opts) as ydl:
                info = ydl.extract_info(url, download=False, process=False)
            return image_post_result(info, url, save_to, headers)
        meta = build_meta(info, url)
        segments, lang = extract_subtitles(info, work_dir, langs, headers)
        if segments:
            return {"ok": True, "source": "native", "lang": lang, "meta": meta,
                    "text": "\n".join(s["text"] for s in segments), "segments": segments}

        # 图文帖:时长 0 且确有图/正文。附加条件是防线 —— 光看 duration==0 会把「元数据缺时长的视频」
        # 误判成图文帖,那样会静默交出一份没有内容的空卡。
        if int(info.get("duration") or 0) == 0 and (dedupe_thumbnails(info) or info.get("description")):
            return image_post_result(info, url, save_to, headers)
        # 有时长却没有任何流 = 地区限制/已删/需登录,不是图文帖。ignore_no_formats_error 让它也回 info
        # 而不是抛,所以这里得自己拦 —— 掉进下面去下音频只会得到一句难懂的 ffmpeg 报错。
        if not (info.get("formats") or info.get("url")):
            raise RuntimeError("这条内容没有可下载的音视频流(常见:地区限制 / 已删除 / 需登录),也不是图文帖")

        # 无字幕:只把音频备好交出去,转写归 Forsion 的语音链路(见文件头)。
        try:
            audio = download_audio(url, work_dir, headers)
        except Exception as exc:
            # 上面 duration 闸没拦住的图文帖会在这里现形(帖子报了假的流)
            if not is_image_post_error(exc):
                raise
            return image_post_result(info, url, save_to, headers)
        # 存档在搬走 wav 之前做:原始压缩音频还躺在 work_dir 里,finally 会把整个目录删掉
        assets = []
        if save_to:
            src = pick_archive_audio([i.name for i in work_dir.iterdir() if i.is_file()])
            if src:
                dest_dir = Path(save_to)
                dest_dir.mkdir(parents=True, exist_ok=True)
                name = "bluebird-%s%s" % (safe_stem(meta.get("videoId")), Path(src).suffix.lower())
                try:
                    shutil.copy2(str(work_dir / src), str(dest_dir / name))
                    assets.append(name)
                except Exception as exc:
                    print("音频存档失败(不影响转写):%s" % exc, file=sys.stderr)

        keep = Path(tempfile.gettempdir()) / f"bluebird-asr-{safe_stem(meta.get('videoId')) or 'audio'}.wav"
        shutil.move(str(audio), str(keep))  # 必须搬出 work_dir —— finally 会把它整个删掉
        out = {"ok": True, "source": "needs_asr", "meta": meta, "audio_path": str(keep),
               "note": "无原生字幕;音频已转 16kHz 单声道 WAV,待宿主用 Forsion 语音识别转写"}
        if assets:
            out["assets"] = assets
        return out
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)  # 清理临时字幕/音频目录(Codex #9)


def selftest():
    vtt = ("WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<c>Hello</c> world\n\n"
           "00:00:04.000 --> 00:00:06.500\n第二句\n")
    segs = parse_vtt_text(vtt)
    assert len(segs) == 2, segs
    assert segs[0]["text"] == "Hello world", segs[0]
    assert abs(segs[0]["end"] - 4.0) < 1e-6, segs[0]
    assert segs[1]["text"] == "第二句", segs[1]
    # CRLF 换行 + 无小时位时间戳(回归 Codex #4)
    crlf = "WEBVTT\r\n\r\n01:02.000 --> 01:04.000\r\nhourless\r\n"
    s2 = parse_vtt_text(crlf)
    assert len(s2) == 1 and s2[0]["text"] == "hourless", s2
    assert abs(s2[0]["start"] - 62.0) < 1e-6, s2
    # 本脚本不得再自带 ASR 供应商:转写一律交 Forsion 语音链路(2026-07-26)。
    # 需要的串用拼接写,否则这行断言自己就成了命中项。
    src = Path(__file__).read_text(encoding="utf-8")
    for banned in ("QWEN3" + "_ASR", "dash" + "scope", "transcribe_by" + "_asr"):
        assert banned not in src, f"脚本不该再自带 ASR 供应商,却出现了 {banned}"
    # 图文帖:同一张图 yt-dlp 回两条(urlDefault/urlPre),去重后只剩一条
    info_img = {
        "id": "abc", "title": "一篇图文", "duration": 0,
        "description": "正文第一段\n正文第二段",
        "thumbnails": [
            {"url": "https://sns.xhscdn.com/x/aaa.jpg?imageView2/2/w/540"},
            {"url": "https://sns.xhscdn.com/x/aaa.jpg!nd_dft_wlteh_webp_3"},
            {"url": "https://sns.xhscdn.com/x/bbb.jpg?sign=1"},
        ],
    }
    assert dedupe_thumbnails(info_img) == [
        "https://sns.xhscdn.com/x/aaa.jpg?imageView2/2/w/540",
        "https://sns.xhscdn.com/x/bbb.jpg?sign=1",
    ], dedupe_thumbnails(info_img)
    assert dedupe_thumbnails({}) == []
    r = image_post_result(info_img, "https://www.xiaohongshu.com/explore/x")
    assert r["source"] == "image_text" and len(r["meta"]["images"]) == 2, r
    assert r["meta"]["thumbnail"] == r["meta"]["images"][0], "封面位没图时应退回第一张图"
    assert r["text"] == "正文第一段\n正文第二段", r["text"]
    # 已有 thumbnail 就别顶掉
    keep = image_post_result({**info_img, "thumbnail": "https://x/cover.jpg"}, "u")
    assert keep["meta"]["thumbnail"] == "https://x/cover.jpg"
    # 存档件的命名与挑选
    assert safe_stem("BV1xx/../../etc") == "BV1xx_______etc", safe_stem("BV1xx/../../etc")
    assert safe_stem("") == "item" and safe_stem("!!!") == "item"
    assert image_ext("image/webp; charset=x", "https://x/a.jpg") == ".webp", "Content-Type 优先"
    assert image_ext("", "https://x/a.JPEG?sign=1") == ".jpg"
    assert image_ext("", "https://x/a.png!nd_dft") == ".png"
    assert image_ext("text/html", "https://x/a") == ".jpg", "都认不出时退 .jpg"
    # keepvideo 之后两份并存:存档要非 wav 的那份
    assert pick_archive_audio(["audio.wav", "audio.m4a"]) == "audio.m4a"
    assert pick_archive_audio(["audio.wav"]) is None, "只有降质 wav 时不存档"
    assert pick_archive_audio(["audio.wav", "audio.sub.vtt"]) is None
    assert pick_archive_audio([]) is None
    # 参数解析:路径带空格必须完整拿到
    assert parse_args(["https://x/a", "--save-to", "/Users/a b/收藏夹/assets"]) == ("https://x/a", "/Users/a b/收藏夹/assets")
    assert parse_args(["--save-to=/tmp/x", "https://x/a"]) == ("https://x/a", "/tmp/x")
    assert parse_args(["https://x/a"]) == ("https://x/a", None)
    # 有时长但没有流 ≠ 图文帖(ignore_no_formats_error 之后它也会回 info,不能当图文处理)
    assert not (int({"duration": 300, "formats": []}.get("duration") or 0) == 0), "有时长就不该进图文档"
    assert is_image_post_error(Exception("ERROR: No video formats found!"))
    assert is_image_post_error(Exception("Unable to extract initial state"))
    assert not is_image_post_error(Exception("HTTP Error 404: Not Found"))
    print("selftest ok")


def parse_args(argv):
    """→ (url, save_to)。`--save-to <绝对目录>` 缺省 None = 只抓不存(TUI 里直接调本脚本时的形态)。"""
    url, save_to, i = None, None, 0
    while i < len(argv):
        a = argv[i]
        if a == "--save-to":
            i += 1
            save_to = argv[i] if i < len(argv) else None
        elif a.startswith("--save-to="):
            save_to = a.split("=", 1)[1]
        elif url is None:
            url = a
        i += 1
    return url, (save_to or None)


def main():
    args = sys.argv[1:]
    if args and args[0] == "--selftest":
        selftest()
        return
    url, save_to = parse_args(args)
    if not url or not url.strip():
        raise ValueError('用法: python transcribe.py <video_url> [--save-to "<绝对目录>"]')
    print(json.dumps(run(url.strip(), save_to), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # noqa: BLE001 — 顶层兜底,错误进 stderr 供 run_bash 判定
        print(str(err), file=sys.stderr)
        sys.exit(1)
