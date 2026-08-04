import json
import sys
import tempfile
from pathlib import Path

from moviepy import VideoFileClip
from yt_dlp import YoutubeDL


def read_payload():
    raw = sys.stdin.read()
    if not raw:
        raise ValueError("missing input payload")
    payload = json.loads(raw)
    return {
        "url": payload.get("url", "").strip(),
        "userAgent": payload.get("userAgent", "").strip(),
        "cookie": payload.get("cookie", "").strip(),
        "download": bool(payload.get("download", False)),
    }


def normalize_publish_at(timestamp):
    if not timestamp:
        return ""
    try:
        return int(timestamp)
    except Exception:
        return ""


def build_meta(info, fallback_url):
    return {
        "videoId": str(info.get("id") or "").strip(),
        "title": str(info.get("title") or "YouTube Video").strip(),
        "author": str(
            info.get("uploader")
            or info.get("channel")
            or info.get("uploader_id")
            or "YouTube Creator"
        ).strip(),
        "duration": int(info.get("duration") or 0),
        "timestamp": normalize_publish_at(info.get("timestamp")),
        "webpageUrl": str(info.get("webpage_url") or fallback_url).strip(),
    }


def extract_subtitles(info, work_dir):
    """Try to extract native or auto-generated subtitles from yt-dlp info."""
    subtitles = []

    # Prefer manually uploaded subtitles, then auto-generated
    sub_sources = [
        info.get("subtitles") or {},
        info.get("automatic_captions") or {},
    ]

    # Language priority: zh > en > first available
    lang_priority = ["zh-Hans", "zh-CN", "zh", "en", "en-US"]

    for source in sub_sources:
        if not source:
            continue
        # Try priority languages first
        chosen_lang = None
        for lang in lang_priority:
            if lang in source:
                chosen_lang = lang
                break
        # Fallback to first available
        if not chosen_lang and source:
            chosen_lang = next(iter(source))

        if not chosen_lang:
            continue

        formats = source[chosen_lang]
        # Prefer json3 or srv3 format for structured subtitles, then vtt
        chosen_format = None
        for fmt in formats:
            ext = fmt.get("ext", "")
            if ext in ("json3", "srv3"):
                chosen_format = fmt
                break
        if not chosen_format:
            for fmt in formats:
                if fmt.get("ext") == "vtt":
                    chosen_format = fmt
                    break
        if not chosen_format and formats:
            chosen_format = formats[0]

        if not chosen_format or "url" not in chosen_format:
            continue

        # Download and parse the subtitle file
        try:
            import urllib.request
            sub_url = chosen_format["url"]
            sub_ext = chosen_format.get("ext", "vtt")
            sub_path = work_dir / f"subs.{sub_ext}"
            urllib.request.urlretrieve(sub_url, str(sub_path))

            if sub_ext == "json3":
                subtitles = parse_json3_subtitles(sub_path)
            elif sub_ext in ("srv3", "srv2", "srv1"):
                subtitles = parse_srv_subtitles(sub_path)
            else:
                subtitles = parse_vtt_subtitles(sub_path)

            if subtitles:
                return subtitles
        except Exception:
            continue

    return subtitles


def parse_json3_subtitles(path):
    """Parse YouTube json3 subtitle format."""
    segments = []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events", [])
    for event in events:
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
    """Parse YouTube srv3/srv2 XML subtitle format."""
    import xml.etree.ElementTree as ET

    segments = []
    tree = ET.parse(str(path))
    root = tree.getroot()

    for p in root.iter("p"):
        text = "".join(p.itertext()).strip()
        if not text:
            continue
        t = int(p.get("t", "0"))
        d = int(p.get("d", "0"))
        segments.append({
            "start": t / 1000.0,
            "end": (t + d) / 1000.0,
            "text": text,
        })

    return segments


def parse_vtt_subtitles(path):
    """Parse WebVTT subtitle format."""
    import re

    segments = []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Match timestamp lines: 00:00:01.000 --> 00:00:04.000
    pattern = re.compile(
        r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})"
    )
    blocks = content.split("\n\n")

    for block in blocks:
        match = pattern.search(block)
        if not match:
            continue
        start_str, end_str = match.group(1), match.group(2)
        # Get text after the timestamp line
        lines = block.split("\n")
        text_lines = []
        found_ts = False
        for line in lines:
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


def vtt_time_to_seconds(time_str):
    parts = time_str.split(":")
    h, m = int(parts[0]), int(parts[1])
    s_parts = parts[2].split(".")
    s, ms = int(s_parts[0]), int(s_parts[1])
    return h * 3600 + m * 60 + s + ms / 1000.0


def extract(payload):
    work_dir = Path(tempfile.mkdtemp(prefix="yt_dl_"))
    output_template = str(work_dir / "input.%(ext)s")

    headers = {
        "User-Agent": payload["userAgent"],
    }
    if payload["cookie"]:
        headers["Cookie"] = payload["cookie"]

    ydl_opts = {
        "quiet": True,
        "noprogress": True,
        "noplaylist": True,
        "http_headers": headers,
        "outtmpl": output_template,
        "format": "bv*+ba/b",
        "merge_output_format": "mp4",
        "skip_download": not payload["download"],
        # Always extract subtitle info
        "writesubtitles": False,
        "writeautomaticsub": False,
    }

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(payload["url"], download=payload["download"])
        meta = build_meta(info, payload["url"])

        # Try to extract subtitles from info dict
        subtitles = extract_subtitles(info, work_dir)

        if not payload["download"]:
            return {
                "meta": meta,
                "subtitles": subtitles,
                "workDir": str(work_dir),
            }

        file_path = ydl.prepare_filename(info)

    merged_path = Path(file_path)
    if merged_path.suffix.lower() != ".mp4":
        fallback = merged_path.with_suffix(".mp4")
        if fallback.exists():
            merged_path = fallback

    if not merged_path.exists():
        for item in work_dir.iterdir():
            if item.suffix.lower() == ".mp4":
                merged_path = item
                break

    if not merged_path.exists():
        raise RuntimeError("merged mp4 not found")

    audio_path = work_dir / "audio.mp3"
    clip = VideoFileClip(str(merged_path))
    clip.audio.write_audiofile(str(audio_path), logger=None)
    clip.close()

    return {
        "meta": meta,
        "subtitles": subtitles,
        "mergedVideoPath": str(merged_path),
        "audioPath": str(audio_path),
        "workDir": str(work_dir),
    }


def main():
    payload = read_payload()
    if not payload["url"]:
        raise ValueError("url is required")
    if not payload["userAgent"]:
        payload["userAgent"] = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        )

    result = extract(payload)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(str(err), file=sys.stderr)
        sys.exit(1)
