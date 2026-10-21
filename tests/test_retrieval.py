import importlib.util
import os
import pathlib
import sys
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


if __name__ == "__main__":
    unittest.main()
