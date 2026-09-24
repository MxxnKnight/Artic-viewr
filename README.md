# Artic Shift — JSONL Viewer

A fast, offline-first viewer for massive multi-line JSON files (`.jsonl`, `.ljson`, `.ljsone`). Expand, search and inspect lines; stats, errors and key maps at a glance. Mobile-first (390px), presented in a phone frame on desktop.

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
| `tests/` | Node harness + class-coverage and text-parity audits |

## Screens

- **Onboarding** — 3-slide carousel
- **Home** — dropzone + recent files + stats
- **Viewer** — virtualized line list, search, type filters, expand, inspect, copy
- **Detail** — collapsible JSON tree / raw views, copy, lat-lon + shift cards
- **Stats** — line counts, type distribution, keys overview, error count

All data stays on-device. The demo dataset ships in `app.js`; the upload/dropzone is wired to open the viewer (real file parsing is the next milestone).
