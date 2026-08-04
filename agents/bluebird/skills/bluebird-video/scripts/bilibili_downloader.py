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
    }


def download_audio(url, user_agent, cookie):
    work_dir = Path(tempfile.mkdtemp(prefix="bili_dl_"))
    output_template = str(work_dir / "audio.%(ext)s")

    ydl_opts = {
        "outtmpl": output_template,
        "format": "ba/b",
        "quiet": True,
        "noplaylist": True,
        "socket_timeout": 300,
        "retries": 3,
        "fragment_retries": 3,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "http_headers": {
            "Referer": "https://www.bilibili.com/",
            "User-Agent": user_agent,
        },
    }
    if cookie:
        ydl_opts["http_headers"]["Cookie"] = cookie

    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)
    except Exception as e:
        error_msg = str(e)
        if "Failed to parse site" in error_msg:
            raise RuntimeError("Bilibili 解析失败：无法识别该视频链接，请检查链接是否有效或更新 yt-dlp 版本")
        elif "unavailable" in error_msg.lower() or "not available" in error_msg.lower():
            raise RuntimeError("该视频可能已被删除或需要登录才能访问")
        elif "forbidden" in error_msg.lower() or "403" in error_msg:
            raise RuntimeError("访问被拒绝：Cookie 可能已过期，请在设置页更新 Bilibili Cookie")
        elif "timeout" in error_msg.lower():
            raise RuntimeError("下载超时：网络连接不稳定，请稍后重试")
        else:
            raise RuntimeError(f"下载失败：{error_msg}")

    audio_path = work_dir / "audio.mp3"
    if not audio_path.exists():
        for item in work_dir.iterdir():
            if item.suffix.lower() in (".mp3", ".m4a", ".opus", ".webm", ".ogg"):
                audio_path = item
                break

    if not audio_path.exists():
        raise RuntimeError("音频下载成功但找不到文件")

    return {
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

    result = download_audio(payload["url"], payload["userAgent"], payload["cookie"])
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(str(err), file=sys.stderr)
        sys.exit(1)
