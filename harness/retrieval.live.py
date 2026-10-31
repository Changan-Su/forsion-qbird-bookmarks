#!/usr/bin/env python3
"""Opt-in network acceptance. Run with Forsion's bundled Python; no cached media.
python harness/retrieval.live.py --out /tmp/bluebird-retrieval-check
Add --url for other platforms. Xiaohongshu links need a fresh xsec_token share URL.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--url', default='https://www.bilibili.com/video/BV1G4Jy6wEok')
args = parser.parse_args()
out = Path(args.out).resolve(); out.mkdir(parents=True, exist_ok=True)
script = Path(__file__).resolve().parents[1] / 'agents/bluebird/skills/bluebird-video/scripts/transcribe.py'
# The subprocess gets an empty fresh assets directory on every invocation.
with tempfile.TemporaryDirectory(prefix='bluebird-network-') as temp:
    assets = Path(temp) / 'assets'
    proc = subprocess.run([sys.executable, str(script), args.url, '--save-to', str(assets)], text=True, capture_output=True, timeout=300)
    value = json.loads(proc.stdout.strip().splitlines()[-1])
    assert proc.returncode == 0 and value.get('ok'), value
    assert value['meta']['videoId'] in args.url, value['meta']
    report = {'url': args.url, 'meta': value['meta'], 'source': value['source'], 'diagnostics': value.get('diagnostics')}
    if value['source'] == 'image_text':
        # 无音轨视频与图文帖:素材与正文就是全部内容
        archived = [assets / name for name in value.get('assets', [])]
        assert archived and all(p.is_file() and p.stat().st_size > 1000 for p in archived), 'No archived media'
        report['archives'] = [{'name': p.name, 'bytes': p.stat().st_size} for p in archived]
    elif value['source'] == 'needs_asr':
        audio = Path(value['audio_path'])
        with wave.open(str(audio), 'rb') as wav:
            report['wav'] = {'sampleRate': wav.getframerate(), 'channels': wav.getnchannels(), 'seconds': wav.getnframes()/wav.getframerate()}
            assert wav.getframerate() == 16000 and wav.getnchannels() == 1
            assert abs(report['wav']['seconds'] - value['meta']['duration']) < 2
            assert any(wav.readframes(min(wav.getnframes(), 16000*20))), 'Silent/empty source'
        archived = [assets / name for name in value.get('assets', [])]
        assert archived and all(p.is_file() and p.stat().st_size > 1000 for p in archived)
        report['archives'] = [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in archived]
    else:
        assert value.get('text') and value.get('segments'), 'No source content'
        report['segments'] = len(value['segments'])
    (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
