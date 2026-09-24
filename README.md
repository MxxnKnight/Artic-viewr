# Artic Shift — JSONL Viewer

A fast, offline-first viewer for massive multi-line JSON files (`.jsonl`, `.ljson`, `.ljsone`). Expand, search and inspect lines; stats, errors and key maps at a glance. A real responsive website: sticky top navbar on desktop, bottom nav island on mobile.

**Live:** https://mxxnknight.github.io/Artic-viewr/

## Run it

No build step, no dependencies. Open `index.html` in a browser, or serve the folder statically:

```sh
npx serve .
# or
python3 -m http.server 8000
```

## Files

| File | What it is |
|---|---|
| `index.html` | Shell: meta, fonts, favicon, root container |
| `styles.css` | Utility stylesheet (compiled from the original mockup + small hand-added block) |
| `icons.js` | Inline SVG icon set (Lucide-style, zero-dependency) |
| `app.js` | All screens, state, rendering, events — plain vanilla JS |
| `phone/` | Preserved copy of the old phone-frame layout (390px frame, notch, pill nav) — frozen for future reference, standalone |
| `tests/` | Node harness + class-coverage and text-parity audits |

## Screens

- **Onboarding** — 3-slide carousel
- **Home** — dropzone (tap/drag-drop a real file), current-file card, live stats
- **Viewer** — windowed line list, search, type chips, Errors filter, sort (line order / oldest / newest / type A–Z), expand, inspect, copy
- **Detail** — collapsible JSON tree, flattened field/value **table**, raw views, copy, auto summary cards
- **Stats** — line counts, error count, type distribution, keys overview, integrity, time span

## Privacy: files never leave the device

There is no server — parsing happens 100% in the browser via the File API.
Nothing is uploaded anywhere, so there is nothing to expire or delete;
closing the tab clears the loaded file from memory.

## File intake

- Supported: `.json`, `.jsonl`, `.ljson`, `.ljsone` (up to 50MB)
- `.jsonl` / `.ljson` / `.ljsone`: one JSON value per line; blank lines skipped
- `.json`: top-level array → one line per element; single object → one line
- Malformed lines are kept as inspectable error records (flagged orange,
  reachable via the Errors filter) instead of aborting the parse
- Large files parse in chunks with a progress bar so the UI never freezes
- Big lists render windowed (200 rows + "Show more") so 100k-line files stay smooth
