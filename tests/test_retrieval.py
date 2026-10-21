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

    def test_denial_and_signed_url_are_preserved_safely(self):
        result = module.failure_result(module.RetrievalError("media", "HTTP Error 567: https://cdn.example/file?sign=SECRET&part=1"))
        self.assertEqual(result["error"]["stage"], "media")
        self.assertEqual(result["error"]["code"], "567")
        self.assertTrue(result["error"]["blocked"])
        self.assertNotIn("SECRET", result["error"]["message"])
        self.assertTrue(result["nextActions"])


if __name__ == "__main__":
    unittest.main()
