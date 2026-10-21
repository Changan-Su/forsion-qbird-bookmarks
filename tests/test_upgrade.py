import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bluebird_upgrade", SOURCE / "upgrade.py")
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)


class UpgradeChecks(unittest.TestCase):
    def test_upgrade_preserves_the_actual_installation_name_and_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            installed = home / "plugins/item"
            installed.mkdir(parents=True)
            (installed / "manifest.json").write_text(json.dumps({"id": "bluebird", "version": "2.0.3"}))
            (installed / "main.js").write_text("old bundle")
            plan = upgrade.install_bundle(SOURCE, home, dry_run=True)
            self.assertEqual(plan["destination"], str(installed.resolve()))
            self.assertEqual((installed / "main.js").read_text(), "old bundle")
            result = upgrade.install_bundle(SOURCE, home)
            self.assertEqual(json.loads((installed / "manifest.json").read_text())["version"], "2.3.0")
            self.assertEqual((Path(result["backup"]) / "main.js").read_text(), "old bundle")
            self.assertFalse((home / "plugins/bluebird").exists())

    def test_duplicate_ids_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            for name in ("item", "bluebird"):
                item = home / "plugins" / name
                item.mkdir(parents=True)
                (item / "manifest.json").write_text(json.dumps({"id": "bluebird", "version": "2.0.3"}))
            with self.assertRaises(ValueError):
                upgrade.install_bundle(SOURCE, home)

    def test_failed_staging_releases_the_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            with patch.object(upgrade.tempfile, "mkdtemp", side_effect=OSError("disk full")):
                with self.assertRaisesRegex(OSError, "disk full"):
                    upgrade.install_bundle(SOURCE, home)
            self.assertFalse((home / "backups/plugin-upgrades/bluebird.lock").exists())
            self.assertTrue(upgrade.install_bundle(SOURCE, home)["restartRequired"])

    def test_destination_is_discovered_after_acquiring_the_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            original_open = upgrade.os.open
            def acquire(*args, **kwargs):
                # Simulate another upgrade finishing just before this invocation acquires its lock.
                if str(args[0]).endswith("bluebird.lock"):
                    installed = home / "plugins/item"
                    installed.mkdir(parents=True)
                    (installed / "manifest.json").write_text(json.dumps({"id":"bluebird","version":"2.0.3"}))
                return original_open(*args, **kwargs)
            with patch.object(upgrade.os, "open", side_effect=acquire):
                result = upgrade.install_bundle(SOURCE, home)
            self.assertEqual(result["destination"], str((home / "plugins/item").resolve()))
            self.assertFalse((home / "plugins/bluebird").exists())


if __name__ == "__main__":
    unittest.main()
