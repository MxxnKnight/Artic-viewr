#!/usr/bin/env python3
"""Text-parity audit: distinctive strings from the original mockup must all
appear in the rewritten app's rendered output. Run: python3 tests/check_parity.py"""
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
    'Tap to browse on mobile • up to 50MB', '.jsonl', '.ljsone',
    'RECENT FILES', 'View all', 'Pro tip',
    'arctic_shift_2024.ljsone', 'shift_nodes.jsonl',
    'buoy_stream_0312.json', 'thermal_drift.ljson',
    '2.4 MB', '1,247', 'Long-press any line in viewer',
    # viewer
    'virtualized', 'Search id, type, keys…', 'Inspect', 'Copy',
    'Live parse', 'total',
    # detail
    'Tree', 'Raw', 'chars', 'Parse error', 'Unexpected end of JSON input',
    'LAT / LON', 'SHIFT DELTA',
    # stats
    'File Stats', 'analyzed offline', 'FILE SIZE', 'ERROR LINES',
    'Type distribution', 'Keys overview', 'Arctic note:', 'thermal',
    'Unique IDs', 'Time span', 'Integrity',
    # nav (mobile + desktop)
    'Lines', 'Home', 'Stats', 'Onboarding', 'Viewer', 'Detail',
    # shell
    'ARTIC SHIFT • #66CCFF', '390px native feel', 'icy blue #66CCFF',
]

BAD = ['createElement', 'useState', 'React Artifact', 'undefined', 'NaN', '[object Object]']

fails = [p for p in PHRASES if p not in ALL]
bad = [b for b in BAD if b in ALL]
print(f"phrases checked: {len(PHRASES)} | missing: {len(fails)} | bad tokens: {len(bad)}")
for p in fails: print("  MISSING:", p)
for b in bad: print("  BAD TOKEN PRESENT:", b)
sys.exit(1 if (fails or bad) else 0)
