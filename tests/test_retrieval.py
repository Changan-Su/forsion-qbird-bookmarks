import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "agents/bluebird/skills/bluebird-video/scripts/transcribe.py"
spec = importlib.util.spec_from_file_location("bluebird_transcribe", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RetrievalChecks(unittest.TestCase):
    def test_platform_headers_and_explicit_cookie(self):
        with patch.dict(os.environ, {"BLUEBIRD_COOKIE": "test-cookie"}):
            headers = module.request_headers("https://www.bilibili.com/video/BV123")
            self.assertEqual(headers["Referer"], "https://www.bilibili.com/")
            self.assertEqual(headers["Cookie"], "test-cookie")
            self.assertEqual(module.request_headers("https://www.xiaohongshu.com/explore/test")["Referer"], "https://www.xiaohongshu.com/")

    def test_initial_state_failure_is_not_an_image_post(self):
        class Downloader:
            def __init__(self, options):
                self.options = options
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def extract_info(self, *args, **kwargs):
                raise RuntimeError("Unable to extract initial state")
        with patch.dict(sys.modules, {"yt_dlp": types.SimpleNamespace(YoutubeDL=Downloader)}):
            with self.assertRaises(module.RetrievalError) as raised:
                module.run("https://www.bilibili.com/video/BV123")
        self.assertEqual(raised.exception.stage, "metadata")

    def test_signed_web_metadata_selects_the_requested_part_and_keeps_mirrors(self):
        calls = []
        class Extractor:
            def __init__(self, downloader): pass
            def _sign_wbi(self, query, video): return query
            def _download_json(self, *args, **kwargs):
                return {"code": 0, "data": {"View": {"bvid": "BV1G4Jy6wEok", "title": "Public video", "duration": 20, "pages": [{"page": 1, "cid": 1, "duration": 20}, {"page": 2, "cid": 2, "duration": 10}]}}}
            def _download_playinfo(self, video, cid, **kwargs):
                calls.append(cid)
                return {"timelength": 10000, "dash": {"audio": [{"baseUrl": "https://media.example/main", "backupUrl": ["https://media.example/backup"]}]}}
            def extract_formats(self, play): return [{"url": "https://media.example/main", "vcodec": "none"}]
            def _get_subtitles(self, *args): return {}
        with patch.dict(sys.modules, {"yt_dlp.extractor.bilibili": types.SimpleNamespace(BiliBiliIE=Extractor)}):
            result = module.bilibili_web_info("https://www.bilibili.com/video/BV1G4Jy6wEok?p=2", None, {})
            self.assertEqual(calls, [2])
            self.assertEqual(result["id"], "BV1G4Jy6wEok_p2")
            self.assertEqual(result["duration"], 10)
            self.assertEqual(result["formats"][0]["bluebird_backup_urls"], ["https://media.example/backup"])
            with self.assertRaisesRegex(RuntimeError, "unavailable"):
                module.bilibili_web_info("https://www.bilibili.com/video/BV1G4Jy6wEok?p=3", None, {})
            with self.assertRaisesRegex(RuntimeError, "full media"):
                module.bilibili_web_info("https://www.bilibili.com/video/BV1G4Jy6wEok", None, {})

    def test_audio_download_uses_only_the_selected_formats_declared_mirror(self):
        import tempfile
        attempts = []
        with tempfile.TemporaryDirectory() as temp:
            work = pathlib.Path(temp)
            class Downloader:
                def __init__(self, options): pass
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def process_ie_result(self, info, download):
                    url = info["formats"][0]["url"]
                    if not download: return {"url": url}
                    attempts.append(url)
                    if url.endswith("main"): raise RuntimeError("HTTP Error 567")
                    (work/"audio.wav").write_bytes(b"RIFF fixture")
            info = {"formats": [{"url": "https://media.example/main", "bluebird_backup_urls": ["https://media.example/backup"]}]}
            with patch.dict(sys.modules, {"yt_dlp": types.SimpleNamespace(YoutubeDL=Downloader)}):
                self.assertEqual(module.download_audio("u", work, {}, info), work/"audio.wav")
            self.assertEqual(attempts, ["https://media.example/main", "https://media.example/backup"])

    def test_inline_bilibili_srt_is_used_before_audio(self):
        with patch("urllib.request.urlopen", side_effect=AssertionError("inline caption needs no download")):
            segments, language = module.extract_subtitles({"subtitles": {"en": [{"ext": "srt", "data": "1\n00:00:01,000 --> 00:00:03,500\nOriginal caption\n"}]}}, pathlib.Path("/unused"), ["en"])
        self.assertEqual(language, "en")
        self.assertEqual(segments, [{"start": 1.0, "end": 3.5, "text": "Original caption"}])

    def test_denial_and_signed_url_are_preserved_safely(self):
        result = module.failure_result(module.RetrievalError("media", "HTTP Error 567: https://cdn.example/file?sign=SECRET&part=1"))
        self.assertEqual(result["error"]["stage"], "media")
        self.assertEqual(result["error"]["code"], "567")
        self.assertTrue(result["error"]["blocked"])
        self.assertNotIn("SECRET", result["error"]["message"])
        self.assertTrue(result["nextActions"])

    def test_silent_video_keeps_the_file_and_never_guesses_when_probing_fails(self):
        info = {"id": "note/1", "title": "Silent", "duration": 5, "description": "Post text", "formats": [{"url": "u"}]}
        with tempfile.TemporaryDirectory() as temp:
            work, assets = pathlib.Path(temp, "work"), pathlib.Path(temp, "assets")
            work.mkdir()
            (work/"audio.mp4").write_bytes(b"silent video")
            probe = types.SimpleNamespace(stdout="video\n")
            with patch("shutil.which", return_value="/bin/ffprobe"), patch("subprocess.run", return_value=probe):
                result = module.silent_video_result(info, work, "u", str(assets), {})
            self.assertEqual(result["source"], "image_text")
            self.assertEqual(result["text"], "Post text")
            self.assertEqual(result["assets"], ["bluebird-note_1.mp4"])
            self.assertEqual((assets/"bluebird-note_1.mp4").read_bytes(), b"silent video")
            # 平台声明了音频流时,文件里没音轨也是下载出错(B 站曾下到纯视频流)
            declared = {**info, "formats": [{"url": "u", "acodec": "aac"}]}
            with patch("shutil.which", return_value="/bin/ffprobe"), patch("subprocess.run", return_value=probe):
                self.assertIsNone(module.silent_video_result(declared, work, "u", None, {}))
            # 有音轨、探测失败、没有 ffprobe:都要让原错误上报
            with patch("shutil.which", return_value="/bin/ffprobe"), patch("subprocess.run", return_value=types.SimpleNamespace(stdout="video\naudio\n")):
                self.assertIsNone(module.silent_video_result(info, work, "u", None, {}))
            with patch("shutil.which", return_value="/bin/ffprobe"), patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "ffprobe")):
                self.assertIsNone(module.silent_video_result(info, work, "u", None, {}))
            with patch("shutil.which", return_value=None):
                self.assertIsNone(module.silent_video_result(info, work, "u", None, {}))

    def test_audio_download_always_uses_range_requests(self):
        seen = {}
        class Downloader:
            def __init__(self, options): seen.update(options)
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def extract_info(self, *args, **kwargs): pass
        with tempfile.TemporaryDirectory() as temp, patch.dict(sys.modules, {"yt_dlp": types.SimpleNamespace(YoutubeDL=Downloader)}):
            (pathlib.Path(temp)/"audio.wav").write_bytes(b"RIFF")
            module.download_audio("u", pathlib.Path(temp), {})
        self.assertGreater(seen["http_chunk_size"], 0)

    def test_audio_download_drops_the_probe_format_selection(self):
        processed = []
        class Downloader:
            def __init__(self, options): pass
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def process_ie_result(self, info, download=False):
                processed.append(info)
                return info
        info = {"formats": [{"url": "a"}], "requested_formats": [{"format_id": "video"}, {"format_id": "audio"}]}
        with tempfile.TemporaryDirectory() as temp, patch.dict(sys.modules, {"yt_dlp": types.SimpleNamespace(YoutubeDL=Downloader)}):
            (pathlib.Path(temp)/"audio.wav").write_bytes(b"RIFF")
            module.download_audio("u", pathlib.Path(temp), {}, info)
        self.assertTrue(processed and all("requested_formats" not in item for item in processed))

    def test_douyin_share_page_uses_the_page_play_address_and_reports_removed_videos(self):
        class Page:
            def __init__(self, html): self.html, self.url = html, "https://www.iesdouyin.com/share/video/123/"
            def read(self): return self.html.encode()
        def ydl_for(data):
            pages = iter([{}, data, data])  # 第一次响应只种 cookie,没有视频数据
            return types.SimpleNamespace(urlopen=lambda request: Page("<script>window._ROUTER_DATA = %s</script>" % json.dumps(next(pages))))
        full = {"loaderData": {"video_(id)/page": {"videoInfoRes": {"item_list": [{"desc": "Clip", "author": {"nickname": "Author"}, "video": {"duration": 8010, "play_addr": {"url_list": ["https://aweme.example/playwm/?video_id=1"]}}}]}}}}
        info = module.douyin_web_info("https://www.douyin.com/video/123", ydl_for(full))
        self.assertEqual((info["id"], info["uploader"], info["duration"]), ("123", "Author", 8.01))
        self.assertEqual(info["formats"][0]["url"], "https://aweme.example/playwm/?video_id=1")
        with self.assertRaisesRegex(RuntimeError, "unavailable"):
            module.douyin_web_info("https://www.douyin.com/video/123", ydl_for({"loaderData": {"video_(id)/page": {"videoInfoRes": {"item_list": []}}}}))


if __name__ == "__main__":
    unittest.main()
