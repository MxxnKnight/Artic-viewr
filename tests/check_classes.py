#!/usr/bin/env python3
"""Class-coverage audit: every CSS class token used by the rendered app must
exist in styles.css. Run: python3 tests/check_classes.py"""
import json, re, subprocess, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

subprocess.run(['node', os.path.join(HERE, 'harness.js')], check=True,
               capture_output=True, cwd=ROOT)
out = json.load(open(os.path.join(HERE, 'render_out.json')))
css = open(os.path.join(ROOT, 'styles.css')).read()

raw = re.findall(r'\.((?:[^\s\{,\}\\]|\\.)+)', css)
defined = set(re.sub(r'\\(.)', r'\1', r) for r in raw)
defined.update(re.findall(r'\[class~="([^"]+)"\]', css))  # hand-added block

used = set()
for html in out.values():
    for m in re.finditer(r'class="([^"]*)"', html):
        used.update(m.group(1).split())
for fname in ('icons.js',):
    src = open(os.path.join(ROOT, fname)).read()
    for m in re.finditer(r'class="([^"]*)"', src):
        used.update(m.group(1).split())

missing = sorted(t for t in used
                if t not in defined
                and '${' not in t          # JS template placeholder, not a class
                and t != 'group')          # Tailwind marker; only group-hover:* needs CSS
print(f"total used: {len(used)} | missing: {len(missing)}")
for t in missing:
    print("  MISSING:", t)
sys.exit(1 if missing else 0)
