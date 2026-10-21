#!/usr/bin/env python3
"""Transactional local bundle upgrade. Preview: python3 upgrade.py dev --dry-run."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import tempfile

ASSETS = ("manifest.json", "main.js", "icon.png", "agents", "skills", "spaces", "tangu-plugins")


def install_bundle(source, home, dry_run=False):
    source, home = Path(source).resolve(), Path(home).expanduser().resolve()
    manifest = json.loads((source / "manifest.json").read_text())
    if manifest.get("id") != "bluebird":
        raise ValueError("Source is not the Bluebird bundle")
    plugins = home / "plugins"
    def discover():
        matches = []
        if plugins.is_dir():
            for child in plugins.iterdir():
                if child.name.startswith(".") or child.is_symlink() or not child.is_dir():
                    continue
                try:
                    if json.loads((child / "manifest.json").read_text()).get("id") == "bluebird":
                        matches.append(child)
                except (OSError, ValueError):
                    continue
        if len(matches) > 1:
            raise ValueError("Multiple Bluebird installations found; resolve duplicates before upgrading: " + ", ".join(map(str, matches)))
        destination = matches[0] if matches else plugins / "bluebird"
        if destination.is_symlink() or (destination.exists() and not matches):
            raise ValueError("Destination is occupied by an unrecognized bundle")
        if destination.resolve() == source:
            raise ValueError("Run the upgrade from a source checkout, not the installed bundle")
        plan = {"id": "bluebird", "version": manifest["version"], "destination": str(destination), "preview": dry_run,
                "preserved": ["vault files", "plugins-data", "seeded agent configuration, memory and modified skills"]}
        return destination, plan
    if dry_run:
        return discover()[1]
    plugins.mkdir(parents=True, exist_ok=True)
    backup_root = home / "backups" / "plugin-upgrades"
    backup_root.mkdir(parents=True, exist_ok=True)
    lock = backup_root / "bluebird.lock"
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    stage = None
    backup = None
    try:
        destination, plan = discover()
        stage = Path(tempfile.mkdtemp(prefix=".bluebird-stage-", dir=plugins))
        for name in ASSETS:
            item = source / name
            if item.is_dir():
                shutil.copytree(item, stage / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            elif item.is_file():
                shutil.copy2(item, stage / name)
        if json.loads((stage / "manifest.json").read_text()).get("version") != manifest["version"] or not (stage / "main.js").stat().st_size:
            raise ValueError("Staged bundle validation failed")
        if destination.exists():
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
            backup = backup_root / (destination.name + "-" + stamp)
            destination.rename(backup)
        try:
            stage.rename(destination)
        except Exception:
            if backup is not None and not destination.exists():
                backup.rename(destination)
            raise
        plan["backup"] = str(backup) if backup else None
        plan["restartRequired"] = True
        return plan
    finally:
        try:
            if stage is not None and stage.exists():
                shutil.rmtree(stage)
        finally:
            lock.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", nargs="?", choices=("dev", "prod"), default="dev")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--target-home", help="Explicit isolated Forsion home for verification")
    args = parser.parse_args()
    home = args.target_home or str(Path.home() / (".forsion-dev" if args.mode == "dev" else ".forsion"))
    print(json.dumps(install_bundle(Path(__file__).parent, home, args.dry_run), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
