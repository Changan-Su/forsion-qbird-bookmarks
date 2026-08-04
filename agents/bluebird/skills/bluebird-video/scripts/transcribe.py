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
    }
    with YoutubeDL(opts) as ydl:
        ydl.extract_info(url, download=True)
    audio = work_dir / "audio.wav"
    if not audio.exists():
        for item in work_dir.iterdir():
            if item.suffix.lower() in (".wav", ".mp3", ".m4a", ".opus", ".webm", ".ogg"):
                audio = item
                break
    if not audio.exists():
        raise RuntimeError("音频下载成功但找不到文件(ffmpeg 是否可用?)")
    return audio


def build_meta(info, fallback_url):
    return {
        "videoId": str(info.get("id") or "").strip(),
        "title": str(info.get("title") or "视频").strip(),
        "author": str(info.get("uploader") or info.get("channel") or info.get("uploader_id") or "").strip(),
        "duration": int(info.get("duration") or 0),
        "webpageUrl": str(info.get("webpage_url") or fallback_url).strip(),
        "thumbnail": str(info.get("thumbnail") or "").strip(),
    }


def run(url):
    from yt_dlp import YoutubeDL
    langs = [s.strip() for s in os.environ.get(
        "BLUEBIRD_LANGS", "zh-Hans,zh-CN,zh,en,en-US").split(",") if s.strip()]
    headers = {"User-Agent": os.environ.get("BLUEBIRD_UA", "").strip() or DEFAULT_UA}
    if os.environ.get("BLUEBIRD_COOKIE", "").strip():
        headers["Cookie"] = os.environ["BLUEBIRD_COOKIE"].strip()
    work_dir = Path(tempfile.mkdtemp(prefix="bluebird_"))
    try:
        with YoutubeDL({"quiet": True, "noprogress": True, "noplaylist": True,
                        "http_headers": headers, "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
        meta = build_meta(info, url)
        segments, lang = extract_subtitles(info, work_dir, langs, headers)
        if segments:
            return {"ok": True, "source": "native", "lang": lang, "meta": meta,
                    "text": "\n".join(s["text"] for s in segments), "segments": segments}

        # 无字幕:只把音频备好交出去,转写归 Forsion 的语音链路(见文件头)。
        audio = download_audio(url, work_dir, headers)
        keep = Path(tempfile.gettempdir()) / f"bluebird-asr-{meta.get('videoId') or 'audio'}.wav"
        shutil.move(str(audio), str(keep))  # 必须搬出 work_dir —— finally 会把它整个删掉
        return {"ok": True, "source": "needs_asr", "meta": meta, "audio_path": str(keep),
                "note": "无原生字幕;音频已转 16kHz 单声道 WAV,待宿主用 Forsion 语音识别转写"}
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
    print("selftest ok")


def main():
    args = sys.argv[1:]
    if args and args[0] == "--selftest":
        selftest()
        return
    if not args or not args[0].strip():
        raise ValueError("用法: python transcribe.py <video_url>")
    print(json.dumps(run(args[0].strip()), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # noqa: BLE001 — 顶层兜底,错误进 stderr 供 run_bash 判定
        print(str(err), file=sys.stderr)
        sys.exit(1)
