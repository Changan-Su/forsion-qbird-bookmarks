import json
import sys
import tempfile
from pathlib import Path

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
    duration = int(info.get("duration") or 0)
    # Deduplicate thumbnails — yt-dlp returns both urlDefault and urlPre per image
    seen = set()
    image_urls = []
    for t in (info.get("thumbnails") or []):
        if not isinstance(t, dict) or not t.get("url"):
            continue
        url = t["url"]
        # Strip query params, CDN transform suffix (!xxx), then take last path component
        base = url.split("?")[0].split("!")[0]
        key = base.split("/")[-1] if "/" in base else base
        if key not in seen:
            seen.add(key)
            image_urls.append(url)
    return {
        "videoId": str(info.get("id") or "").strip(),
        "title": str(info.get("title") or "小红书视频").strip(),
        "author": str(
            info.get("uploader")
            or info.get("uploader_id")
            or info.get("channel")
            or "小红书作者"
        ).strip(),
        "duration": duration,
        "timestamp": normalize_publish_at(info.get("timestamp")),
        "webpageUrl": str(info.get("webpage_url") or fallback_url).strip(),
        "description": str(info.get("description") or ""),
        "imageUrls": image_urls,
        "isImagePost": duration == 0,
    }


def _extract_metadata_only(payload, work_dir, headers):
    """Extract metadata without downloading (used for image posts)."""
    ydl_opts = {
        "quiet": True,
        "noprogress": True,
        "noplaylist": True,
        "http_headers": headers,
        "outtmpl": str(work_dir / "audio.%(ext)s"),
        "skip_download": True,
        "ignore_no_formats_error": True,
    }
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(payload["url"], download=False)
        meta = build_meta(info, payload["url"])
    return {
        "meta": meta,
        "workDir": str(work_dir),
    }


def extract(payload):
    work_dir = Path(tempfile.mkdtemp(prefix="xhs_dl_"))
    output_template = str(work_dir / "audio.%(ext)s")

    headers = {
        "Referer": "https://www.xiaohongshu.com/",
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
        "skip_download": not payload["download"],
        "ignore_no_formats_error": True,
    }

    if payload["download"]:
        ydl_opts["format"] = "ba/b"
        ydl_opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ]

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(payload["url"], download=payload["download"])
            meta = build_meta(info, payload["url"])

            # Image post detected (duration == 0): return metadata only, no audio
            if meta["isImagePost"]:
                return {
                    "meta": meta,
                    "workDir": str(work_dir),
                }

            if not payload["download"]:
                return {
                    "meta": meta,
                    "workDir": str(work_dir),
                }
    except Exception as exc:
        # yt-dlp may throw "no video formats found" for image-text posts;
        # fall back to metadata-only extraction.
        err_msg = str(exc).lower()
        if "no video formats" in err_msg or "unable to extract" in err_msg:
            return _extract_metadata_only(payload, work_dir, headers)
        raise

    audio_path = work_dir / "audio.mp3"
    if not audio_path.exists():
        for item in work_dir.iterdir():
            if item.suffix.lower() in (".mp3", ".m4a", ".opus", ".webm", ".ogg"):
                audio_path = item
                break

    if not audio_path.exists():
        raise RuntimeError("音频下载成功但找不到文件")

    return {
        "meta": meta,
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
