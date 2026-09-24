#!/usr/bin/env python3
"""Text-parity audit: distinctive strings of the current UI must all appear in
the rendered output. Run: python3 tests/check_parity.py
(Dummy-data strings from the old mockup were intentionally removed.)"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
out = json.load(open(os.path.join(HERE, 'render_out.json')))
ALL = '\n'.join(out.values())

PHRASES = [
    # onboarding
    'ARTIC SHIFT', 'SKIP', 'LJSON • JSONL • LJSONE', 'Shift through',
    'Arctic data', 'like ice.', 'ZERO-LAG', 'Begin Shift',
    'No data leaves your device', 'offline-first', 'tap to browse on mobile',
    'shift_001.ljson', '2,847 lines • parsed', 'SHIFT VIEW',
    'Virtualized viewer for massive multi-line JSON',
    # home
    'WELCOME BACK', 'Arctic Lab', 'Drop .jsonl / .ljsone here',
    'up to 50MB', '.json', '.jsonl', '.ljson', '.ljsone',
    'Pro tip', 'Private by design', 'never uploaded anywhere',
    'No file loaded yet', 'CURRENT FILE', 'Open in viewer',
    'LINES', 'ERRORS', 'SIZE', 'on-device only',
    # viewer
    'virtualized', 'Search id, type, keys', 'Inspect', 'Copy',
    'visible', 'total', 'Show more', 'Clear filters',
    'No file loaded', 'Choose file',
    'Line order', 'Oldest first', 'Newest first', 'Type A–Z',
    # detail
    'Tree', 'Table', 'Raw', 'chars', 'Parse error',
    'FIELD', 'VALUE',
    # stats
    'File Stats', 'analyzed on-device', 'AVG / LINE', 'ERROR LINES',
    'Type distribution', 'Keys overview', 'Integrity', 'Time span',
    'Unique types', 'No stats yet',
    # nav (mobile + desktop)
    'Lines', 'Home', 'Stats', 'Onboarding', 'Viewer', 'Detail',
    # shell
    'ARTIC SHIFT • #66CCFF', '390px native feel', 'icy blue #66CCFF',
]

# Strings that must NOT appear (old dummy data / React leftovers).
ABSENT = [
    'arctic_shift_2024.ljsone', 'shift_nodes.jsonl', 'buoy_stream_0312.json',
    'thermal_drift.ljson', 'RECENT FILES', 'LAT / LON', 'SHIFT DELTA',
    'Arctic note:', 'createElement', 'useState', 'React Artifact',
    '[object Object]',
]

fails = [p for p in PHRASES if p not in ALL]
present_bad = [b for b in ABSENT if b in ALL]
print(f"phrases checked: {len(PHRASES)} | missing: {len(fails)} | forbidden present: {len(present_bad)}")
for p in fails: print("  MISSING:", p)
for b in present_bad: print("  FORBIDDEN PRESENT:", b)
sys.exit(1 if (fails or present_bad) else 0)
