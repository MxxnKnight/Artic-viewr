/* ============================================================================
 * Artic Shift — JSONL viewer
 * ----------------------------------------------------------------------------
 * A fast, offline-first viewer for massive multi-line JSON files (.jsonl,
 * .ljson, .ljsone). Expand, search and inspect lines; stats, errors and key
 * maps at a glance. Mobile-first (390px), presented in a phone frame on
 * desktop.
 *
 * No build step, no dependencies, no framework. Open index.html or serve
 * this folder statically (e.g. GitHub Pages).
 *
 * Structure:
 *   index.html  — shell, fonts, meta
 *   styles.css  — utility stylesheet (compiled from the original mockup)
 *   icons.js    — inline SVG icon set (Lucide-style, zero-dependency)
 *   app.js      — this file: data, state, screens, rendering, events
 * ========================================================================== */
'use strict';

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

/** Escape a string for safe insertion into HTML. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tiny haptic tap on supported phones. */
function haptic() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
  } catch (_) { /* ignore */ }
}

/** Copy text, with a legacy fallback for non-secure contexts. */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* ignore */ }
  document.body.removeChild(ta);
}

/* ------------------------------------------------------------------ */
/* File parsing (100% on-device — nothing is ever uploaded)            */
/* ------------------------------------------------------------------ */

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB, as advertised on Home
const TS_KEYS = ['timestamp', 'ts', 'time', '@timestamp', 'date', 'datetime'];
const TYPE_KEYS = ['type', 'kind', 'event', 'eventType', 'category'];
const ID_KEYS = ['id', '_id', 'key', 'uuid', 'name'];

/** Pick the first present key from a candidate list. */
function pickKey(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Build one viewer line record from a parsed value. */
function makeLine(uid, n, raw, value, err) {
  if (err || value === undefined) {
    return {
      uid, n,
      id: 'line_' + String(n).padStart(3, '0'),
      timestamp: '', type: 'error',
      raw: String(raw).slice(0, 2000),
      error: err || 'Unparseable line',
    };
  }
  const idv = pickKey(value, ID_KEYS);
  return {
    uid, n,
    id: idv !== undefined ? String(idv) : 'line_' + String(n).padStart(3, '0'),
    timestamp: String(pickKey(value, TS_KEYS) ?? ''),
    type: String(pickKey(value, TYPE_KEYS) ?? 'record'),
    raw: typeof raw === 'string' ? raw : JSON.stringify(raw),
  };
}

/**
 * Parse raw file text into line records. Pure function (testable in node).
 * `.json`: top-level array -> one line per element; single object -> one
 * line; anything else falls back to newline-delimited parsing.
 * `.jsonl` / `.ljson` / `.ljsone`: one JSON value per line; blank lines are
 * skipped, malformed lines become inspectable error records.
 */
function parseFileContent(name, text) {
  const ext = String(name).split('.').pop().toLowerCase();
  const lines = [];
  const trimmed = text.trim();
  if (!trimmed) return lines;

  if (ext === 'json' && (trimmed[0] === '[' || trimmed[0] === '{')) {
    try {
      const v = JSON.parse(trimmed);
      const arr = Array.isArray(v) ? v : [v];
      arr.forEach((el, i) => lines.push(makeLine(i, i + 1, el, el)));
      return lines;
    } catch (e) {
      // Not a single JSON document — it may be JSONL saved with a .json
      // extension. Fall through to line-delimited parsing; malformed lines
      // become individual inspectable error records. If no line parses on
      // its own, keep the original whole-file error instead.
      const wholeFileError = 'Invalid JSON: ' + e.message;
      const tmp = [];
      let n = 0, ok = 0;
      for (const rl of text.split(/\r?\n/)) {
        if (!rl.trim()) continue;
        n++;
        try {
          tmp.push(makeLine(tmp.length, n, rl, JSON.parse(rl)));
          ok++;
        } catch (err) {
          tmp.push(makeLine(tmp.length, n, rl, undefined,
            'Line ' + n + ': ' + err.message));
        }
      }
      if (ok > 0) return tmp;
      lines.push(makeLine(0, 1, trimmed.slice(0, 2000), undefined,
        wholeFileError));
      return lines;
    }
  }

  const rawLines = text.split(/\r?\n/);
  let n = 0;
  for (const rl of rawLines) {
    if (!rl.trim()) continue;
    n++;
    try {
      lines.push(makeLine(lines.length, n, rl, JSON.parse(rl)));
    } catch (e) {
      lines.push(makeLine(lines.length, n, rl, undefined,
        'Line ' + n + ': ' + e.message));
    }
  }
  return lines;
}

/** Human-readable byte size. */
function formatBytes(b) {
  if (!b && b !== 0) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Flatten a JSON value into [dot.path, value] rows for table mode. */
function flattenJSON(value, prefix, out) {
  out = out || [];
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i, v])
      : Object.entries(value);
    if (entries.length === 0) out.push([prefix || '(root)', Array.isArray(value) ? '[]' : '{}']);
    entries.forEach(([k, v]) => {
      const p = prefix ? prefix + '.' + k : String(k);
      if (v !== null && typeof v === 'object') flattenJSON(v, p, out);
      else out.push([p, v]);
    });
  } else {
    out.push([prefix || '(root)', value]);
  }
  return out;
}

/** Render a scalar cell value with the app's type colours. */
function cellValue(v) {
  if (v === null) return '<span class="text-[#FF8FD8]">null</span>';
  if (typeof v === 'string') return '<span class="text-[#C9F99A]">&quot;' + esc(v) + '&quot;</span>';
  if (typeof v === 'number') return '<span class="text-[#FFC27A]">' + esc(v) + '</span>';
  if (typeof v === 'boolean') return '<span class="text-[#FF8FD8]">' + esc(v) + '</span>';
  return '<span class="text-white/60">' + esc(String(v)) + '</span>';
}

/* ------------------------------------------------------------------ */
/* JSON rendering                                                      */
/* ------------------------------------------------------------------ */

/**
 * Syntax-highlight a JSON string. Keys are icy blue, strings pale green,
 * numbers amber, booleans/null pink, brackets slate.
 */
function highlightJSON(text) {
  const tokens = String(text).split(/(".*?"|\btrue\b|\bfalse\b|\bnull\b|-?\d+\.?\d*|[{}\[\]:,])/g);
  let html = '';
  for (const tok of tokens) {
    if (!tok) continue;
    const safe = esc(tok);
    let cls;
    if (tok.startsWith('"')) {
      const isKey = tok.endsWith('":') || text.includes(tok + ':');
      cls = isKey ? 'text-[#7DD3FF]' : 'text-[#C9F99A]';
    } else if (/^-?\d/.test(tok)) {
      cls = 'text-[#FFC27A]';
    } else if (tok === 'true' || tok === 'false' || tok === 'null') {
      cls = 'text-[#FF8FD8]';
    } else if (/[{}[\]]/.test(tok)) {
      cls = 'text-[#5A6B82]';
    } else {
      cls = 'text-[#8A9BB2]';
    }
    html += '<span class="' + cls + '">' + safe + '</span>';
  }
  return '<span class="font-mono text-[12px] leading-[18px] break-all max-w-full">' + html + '</span>';
}

/**
 * Collapsible JSON tree view. `path` identifies the node (for toggle state),
 * `level` controls the default collapsed state (deeper than 1 = collapsed).
 */
function treeHTML(data, path, level) {
  if (data === null) return '<span class="text-[#FF8FD8]">null</span>';
  if (typeof data !== 'object') {
    if (typeof data === 'string') return '<span class="text-[#C9F99A]">&quot;' + esc(data) + '&quot;</span>';
    if (typeof data === 'number') return '<span class="text-[#FFC27A]">' + esc(data) + '</span>';
    return '<span class="text-[#FF8FD8]">' + esc(String(data)) + '</span>';
  }
  const isArr = Array.isArray(data);
  const entries = isArr ? data.map((v, i) => [i, v]) : Object.entries(data);
  if (entries.length === 0) {
    return '<span class="text-[#5A6B82]">' + (isArr ? '[]' : '{}') + '</span>';
  }
  const toggled = state.treeToggled.has(path);
  const collapsed = toggled ? !(level > 1) : level > 1;
  const open = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';

  let html = '<div class="font-mono text-[13px] leading-[20px]">';
  html += '<button data-action="tree-toggle" data-path="' + esc(path) + '" class="cursor-pointer select-none inline-flex items-center gap-1 text-[#5A6B82] hover:text-[#8A9BB2] min-h-[28px]">';
  html += '<span class="text-[10px]">' + (collapsed ? '▶' : '▼') + '</span>';
  html += '<span>' + open + '</span>';
  if (collapsed) html += '<span class="text-[#5A6B82] text-[11px]"> ' + entries.length + ' items </span>';
  html += '</button>';
  if (!collapsed) {
    html += '<div class="ml-[14px] border-l border-[#1E2D40] pl-3">';
    entries.forEach(([k, v], idx) => {
      const childPath = path + '.' + k;
      html += '<div class="py-[1px]">';
      if (!isArr) {
        html += '<span class="text-[#7DD3FF]">&quot;' + esc(k) + '&quot;</span>';
        html += '<span class="text-[#5A6B82]">: </span>';
      }
      html += treeHTML(v, childPath, level + 1);
      if (idx < entries.length - 1) html += '<span class="text-[#5A6B82]">,</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<span class="text-[#5A6B82]">' + close + '</span>';
  } else {
    html += '<span class="text-[#5A6B82]">' + close + '</span>';
  }
  html += '</div>';
  return html;
}

/** Parse a line's raw JSON; null on failure (or for error lines). */
function parseLine(line) {
  if (!line || line.error) return null;
  try { return JSON.parse(line.raw); } catch (_) { return null; }
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  screen: 'onboarding',   // onboarding | home | viewer | detail | stats
  slide: 0,               // onboarding carousel index
  doc: null,              // loaded file: { name, sizeBytes, lines, parsedMs }
  line: null,             // line open in the detail view
  search: '',             // viewer search query
  typeFilter: 'All',      // viewer type chip filter
  errorsOnly: false,      // viewer "show only malformed lines" toggle
  sort: 'line',           // viewer sort: line | timeAsc | timeDesc | type
  sortOpen: false,        // sort popover visibility
  renderLimit: 200,       // windowed rendering: rows currently shown
  expanded: new Set(),    // expanded line uids in the viewer
  detailTab: 'tree',      // detail view tab: tree | table | raw
  copied: false,          // detail copy-button feedback
  treeToggled: new Set(), // tree node paths the user explicitly toggled
  dragOver: false,        // dropzone drag state
  parsing: null,          // { name, pct } while a file is being parsed
  fileError: '',          // upload error message shown on home
};

/** All lines of the loaded file (empty when nothing is loaded). */
function allLines() {
  return state.doc ? state.doc.lines : [];
}

/** Timestamp as a sortable number; NaN when missing/invalid. */
function lineTime(l) {
  if (!l.timestamp) return NaN;
  const t = Date.parse(l.timestamp);
  return isNaN(t) ? NaN : t;
}

const SORTS = {
  line:     { label: 'Line order' },
  timeAsc:  { label: 'Oldest first' },
  timeDesc: { label: 'Newest first' },
  type:     { label: 'Type A–Z' },
};

/** Lines matching the current search / filter / sort settings. */
function visibleLines() {
  const q = state.search.trim().toLowerCase();
  let out = allLines().filter((l) => {
    if (state.errorsOnly && !l.error) return false;
    if (state.typeFilter !== 'All' && l.type !== state.typeFilter) return false;
    if (!q) return true;
    return l.id.toLowerCase().includes(q) ||
      l.type.toLowerCase().includes(q) ||
      l.raw.toLowerCase().includes(q);
  });
  if (state.sort === 'timeAsc' || state.sort === 'timeDesc') {
    const dir = state.sort === 'timeAsc' ? 1 : -1;
    out = out.slice().sort((a, b) => {
      const ta = lineTime(a), tb = lineTime(b);
      if (isNaN(ta) && isNaN(tb)) return a.n - b.n;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return (ta - tb) * dir || (a.n - b.n);
    });
  } else if (state.sort === 'type') {
    out = out.slice().sort((a, b) =>
      a.type.localeCompare(b.type) || (a.n - b.n));
  }
  return out;
}

/** Reset the render window whenever the visible set changes. */
function resetWindow() {
  state.renderLimit = 200;
}

/** Distinct types in the loaded file, most frequent first (capped at 8). */
function fileTypes() {
  const counts = {};
  for (const l of allLines()) counts[l.type] = (counts[l.type] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
}

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */

const SLIDES = [
  'Virtualized viewer for massive multi-line JSON. 10k+ lines, zero lag.',
  'Expand, search, inspect. Built for field telemetry and shift logs.',
  'Stats, errors, and key maps at a glance. Dark. Fast. Precise.',
];

function onboardingHTML() {
  const dots = [0, 1, 2].map((i) =>
    '<div data-action="dot" data-i="' + i + '" class="h-1.5 rounded-full transition-all duration-300 cursor-pointer ' +
    (i === state.slide ? 'w-8 bg-[#66CCFF]' : 'w-1.5 bg-white/20') + '"></div>'
  ).join('');

  return '' +
  '<div class="relative overflow-hidden flex-1 flex flex-col justify-center">' +
    '<div class="absolute -top-[120px] -left-[80px] w-[340px] h-[340px] bg-[#66CCFF]/25 rounded-full blur-[80px] pointer-events-none"></div>' +
    '<div class="absolute top-[180px] -right-[100px] w-[300px] h-[300px] bg-[#66CCFF]/15 rounded-full blur-[70px] pointer-events-none"></div>' +
    '<div class="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-t from-[#66CCFF]/10 to-transparent pointer-events-none"></div>' +

    '<div class="relative z-10 max-w-4xl mx-auto px-6 py-8 lg:py-14">' +
    '<div class="flex justify-between items-center">' +
      '<div class="flex items-center gap-2">' +
        '<div class="w-8 h-8 rounded-[10px] bg-white text-black flex items-center justify-center">' + icon('Snowflake', 18) + '</div>' +
        '<span class="font-semibold tracking-[-0.02em] text-[15px]">ARTIC SHIFT</span>' +
      '</div>' +
      '<button data-action="skip" class="min-h-[44px] min-w-[44px] px-3 flex items-center justify-center text-[12px] tracking-widest text-white/50 hover:text-white/80 rounded-full">SKIP</button>' +
    '</div>' +

    '<div class="mt-10 lg:mt-14 grid gap-10 lg:grid-cols-2 items-center">' +
      '<div>' +
        '<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#66CCFF]/10 border border-[#66CCFF]/20 text-[11px] tracking-widest text-[#66CCFF] mb-6 self-start">' +
          '<span class="w-1.5 h-1.5 rounded-full bg-[#66CCFF] animate-pulse"></span>LJSON • JSONL • LJSONE' +
        '</div>' +
        '<h1 class="text-[32px] sm:text-[36px] lg:text-[44px] font-[750] leading-[0.95] tracking-[-0.04em] mb-4">Shift through<br><span class="text-[#66CCFF]">Arctic data</span><br>like ice.</h1>' +
        '<p class="text-[14px] leading-[22px] text-white/55 max-w-[380px]">' + esc(SLIDES[state.slide]) + '</p>' +

        '<div class="mt-8">' +
          '<div class="flex items-center justify-between mb-5">' +
            '<div class="flex gap-1.5">' + dots + '</div>' +
            '<div class="flex gap-2">' +
              (state.slide > 0
                ? '<button data-action="slide" data-dir="-1" class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 flex items-center justify-center active:scale-95">' + icon('ChevronLeft', 18) + '</button>'
                : '') +
              '<button data-action="slide" data-dir="1" class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white text-black flex items-center justify-center active:scale-95">' + icon('ChevronRight', 18) + '</button>' +
            '</div>' +
          '</div>' +
          '<button data-action="begin" class="w-full sm:w-auto sm:px-10 h-[56px] min-h-[56px] rounded-[18px] bg-[#66CCFF] text-black font-semibold text-[15px] tracking-[-0.01em] flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(102,204,255,0.35)] hover:bg-[#7DD3FF] active:scale-[0.98] transition-all">Begin Shift ' + icon('ArrowUpRight', 18) + '</button>' +
          '<div class="mt-3 text-[11px] text-white/30">No data leaves your device • offline-first • tap to browse on mobile</div>' +
        '</div>' +
      '</div>' +

      '<div class="relative">' +
          '<div class="rounded-[20px] bg-[#111A26]/90 border border-white/[0.06] backdrop-blur p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">' +
            '<div class="flex items-center gap-2 mb-3">' +
              '<div class="w-2 h-2 rounded-full bg-[#FF5F57]"></div>' +
              '<div class="w-2 h-2 rounded-full bg-[#FFBD2E]"></div>' +
              '<div class="w-2 h-2 rounded-full bg-[#28CA42]"></div>' +
              '<span class="ml-auto text-[10px] text-white/30 font-mono">shift_001.ljson</span>' +
            '</div>' +
            '<div class="space-y-1.5 font-mono text-[11px]">' +
              '<div class="flex gap-2"><span class="text-white/20">001</span><span class="text-[#7DD3FF]">&quot;id&quot;</span><span class="text-white/30">:</span><span class="text-[#C9F99A]">&quot;shift_001&quot;</span></div>' +
              '<div class="flex gap-2"><span class="text-white/20">002</span><span class="text-[#7DD3FF]">&quot;temp&quot;</span><span class="text-white/30">:</span><span class="text-[#FFC27A]">-32.4</span><span class="text-white/20">, // °C</span></div>' +
              '<div class="flex gap-2"><span class="text-white/20">003</span><span class="text-[#7DD3FF]">&quot;shift&quot;</span><span class="text-white/30">:</span><span class="text-[#FFC27A]">0.42</span><span class="w-16 h-[3px] bg-[#66CCFF] rounded-full mt-[7px] ml-2"></span></div>' +
              '<div class="flex gap-2 opacity-60"><span class="text-white/20">004</span><span class="text-white/30">{ ... }</span></div>' +
            '</div>' +
            '<div class="mt-4 flex items-center gap-2">' +
              '<div class="flex -space-x-1">' +
                '<div class="w-5 h-5 rounded-full bg-[#1E2D40] border border-[#0A0F18] flex items-center justify-center text-[9px]">❄</div>' +
                '<div class="w-5 h-5 rounded-full bg-[#66CCFF] border border-[#0A0F18] flex items-center justify-center text-[9px] text-black font-bold">A</div>' +
              '</div>' +
              '<span class="text-[11px] text-white/40">2,847 lines • parsed</span>' +
              '<span class="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#66CCFF] text-black font-semibold">SHIFT VIEW</span>' +
            '</div>' +
          '</div>' +
          '<div class="absolute -right-1 -top-3 rotate-3 bg-white text-black text-[10px] font-semibold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">' + icon('Zap', 12) + ' ZERO-LAG</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function homeHTML() {
  const doc = state.doc;
  const errCount = doc ? doc.lines.filter((l) => l.error).length : 0;

  const dropCls = state.dragOver
    ? 'border-[#66CCFF] bg-[#66CCFF]/10'
    : 'border-white/10 bg-[#121B27] hover:border-[#66CCFF]/40 hover:bg-[#121B27]/80';

  const errBanner = state.fileError
    ? '<div class="rounded-[16px] bg-[#FF9A6C]/10 border border-[#FF9A6C]/25 p-3.5 flex gap-3 items-start">' +
      '<div class="text-[#FF9A6C] shrink-0 mt-0.5">' + icon('TriangleAlert', 16) + '</div>' +
      '<div class="text-[12px] text-[#FF9A6C]/90 leading-[18px]">' + esc(state.fileError) + '</div>' +
      '</div>'
    : '';

  const currentFile = doc
    ? '<div>' +
      '<h3 class="text-[13px] font-semibold tracking-wide text-white/80 mb-3">CURRENT FILE</h3>' +
      '<div class="rounded-[16px] bg-[#121D2B] border border-[#66CCFF]/25 p-4">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-11 h-11 min-w-[44px] rounded-[12px] bg-[#66CCFF]/10 border border-[#66CCFF]/20 flex items-center justify-center text-[#66CCFF] shrink-0">' + icon('FileJson', 18) + '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-[13px] font-medium truncate">' + esc(doc.name) + '</div>' +
            '<div class="flex items-center gap-3 mt-1 text-[11px] text-white/45">' +
              '<span class="flex items-center gap-1">' + icon('HardDrive', 10) + ' ' + esc(formatBytes(doc.sizeBytes)) + '</span>' +
              '<span class="flex items-center gap-1">' + icon('FileText', 10) + ' ' + doc.lines.length.toLocaleString() + ' lines</span>' +
              (errCount ? '<span class="flex items-center gap-1 text-[#FF9A6C]">' + icon('TriangleAlert', 10) + ' ' + errCount + ' errors</span>' : '') +
            '</div>' +
          '</div>' +
          '<button data-action="remove-file" aria-label="Remove file" class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-white/5 hover:bg-[#FF9A6C]/20 flex items-center justify-center text-white/50 hover:text-[#FF9A6C] shrink-0 active:scale-95">' + icon('Trash2', 16) + '</button>' +
        '</div>' +
        '<button data-action="open-viewer" class="mt-3 w-full h-11 min-h-[44px] rounded-[12px] bg-[#66CCFF] text-black text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.99]">Open in viewer ' + icon('ArrowUpRight', 14) + '</button>' +
      '</div>' +
      '</div>'
    : '<div class="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4 flex gap-3 items-center">' +
      '<div class="w-9 h-9 min-w-[36px] rounded-full bg-white/5 flex items-center justify-center text-white/40 shrink-0">' + icon('FileJson', 16) + '</div>' +
      '<div class="text-[12px] text-white/45 leading-[18px]">No file loaded yet.<br>Drop a file above or tap the drop zone to browse.</div>' +
      '</div>';

  const stat = (ic, label, val, sub, subCls) =>
    '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-3">' +
      '<div class="text-[11px] text-white/40 flex items-center gap-1">' + icon(ic, 12) + ' ' + label + '</div>' +
      '<div class="text-[20px] font-semibold mt-1 leading-none">' + val + '</div>' +
      '<div class="text-[10px] mt-1 ' + subCls + '">' + sub + '</div>' +
    '</div>';

  return '' +
  '<div class="py-8 lg:py-12">' +
    '<div class="flex items-center justify-between gap-4">' +
      '<div>' +
        '<div class="text-[12px] tracking-widest text-white/40">WELCOME BACK</div>' +
        '<h2 class="text-[28px] lg:text-[36px] font-semibold tracking-[-0.02em]">Arctic Lab</h2>' +
        '<p class="text-[13px] text-white/45 mt-2 max-w-[520px] leading-[20px]">Drop a JSONL file and inspect it line by line — search, filter, and view every record as a tree, table, or raw JSON.</p>' +
      '</div>' +
      '<div class="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-[#1A2636] border border-white/10 hidden sm:flex items-center justify-center shrink-0"><span class="text-[12px]">A</span></div>' +
    '</div>' +

    '<div class="mt-8 space-y-5">' +
      '<div>' +
      '<div id="dropzone" role="button" tabindex="0" data-action="upload" class="group rounded-[20px] border-2 border-dashed p-5 transition-all cursor-pointer min-h-[110px] flex flex-col justify-center active:scale-[0.99] ' + dropCls + '">' +
        '<div class="flex items-center gap-4">' +
          '<div class="w-12 h-12 min-w-[48px] rounded-[14px] bg-[#66CCFF]/15 flex items-center justify-center text-[#66CCFF] group-hover:scale-105 transition-transform">' + icon('CloudUpload', 22) + '</div>' +
          '<div class="flex-1">' +
            '<div class="text-[15px] font-medium leading-tight">Drop .jsonl / .ljsone here</div>' +
            '<div class="text-[12px] text-white/45 mt-1">Tap to browse on mobile &bull; up to 50MB</div>' +
          '</div>' +
          '<div class="w-11 h-11 min-w-[44px] rounded-full bg-white/10 flex items-center justify-center shrink-0">' + icon('ArrowUpRight', 14) + '</div>' +
        '</div>' +
        '<div class="mt-4 flex gap-2 flex-wrap">' +
          ['.json', '.jsonl', '.ljson', '.ljsone'].map((ext) =>
            '<span class="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">' + ext + '</span>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<div class="mt-2.5 flex items-start gap-2 px-1">' +
        '<span class="text-[#66CCFF] mt-[1px] shrink-0">' + icon('ShieldCheck', 13) + '</span>' +
        '<div class="text-[11px] text-white/40 leading-[16px]">Private by design &mdash; files are parsed on your device and never uploaded anywhere. Closing the tab clears them.</div>' +
      '</div>' +
      '</div>' +

      errBanner +

      '<div class="grid gap-5 lg:grid-cols-5">' +
      '<div class="lg:col-span-3">' + currentFile + '</div>' +
      '<div class="lg:col-span-2">' +
      '<div class="grid grid-cols-3 gap-3">' +
        stat('Database', 'LINES', doc ? doc.lines.length.toLocaleString() : '&mdash;', doc ? 'parsed' : 'no file', 'text-white/30') +
        stat('TriangleAlert', 'ERRORS', doc ? String(errCount) : '&mdash;', errCount ? 'needs review' : (doc ? 'all clean' : 'no file'), errCount ? 'text-[#FF9A6C]' : 'text-white/30') +
        stat('HardDrive', 'SIZE', doc ? esc(formatBytes(doc.sizeBytes)) : '&mdash;', doc ? 'on-device only' : 'no file', 'text-white/30') +
      '</div>' +

      '<div class="mt-5 rounded-[16px] bg-gradient-to-br from-[#66CCFF]/15 to-[#66CCFF]/5 border border-[#66CCFF]/20 p-4 flex gap-3">' +
        '<div class="w-9 h-9 min-w-[36px] rounded-full bg-[#66CCFF] text-black flex items-center justify-center shrink-0">' + icon('Sparkles', 16) + '</div>' +
        '<div>' +
          '<div class="text-[13px] font-medium">Pro tip</div>' +
          '<div class="text-[12px] text-white/60 leading-[18px] mt-1">Malformed lines are kept and flagged &mdash; use the Errors filter in Lines to jump straight to them.</div>' +
        '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function typeBadge(line) {
  const cls = line.error
    ? 'bg-[#FF9A6C]/20 text-[#FF9A6C]'
    : line.type === 'thermal' ? 'bg-[#66CCFF]/15 text-[#66CCFF]'
    : line.type === 'drift'   ? 'bg-[#C9F99A]/15 text-[#C9F99A]'
    : 'bg-white/10 text-white/60';
  return '<span class="text-[11px] px-2 py-0.5 rounded font-mono ' + cls + '">' + esc(line.type) + '</span>';
}

function viewerHTML() {
  const doc = state.doc;

  // ---- empty state: no file loaded yet ---------------------------------
  if (!doc) {
    return '' +
    '<div class="py-20 lg:py-28 flex flex-col items-center justify-center px-8 text-center max-w-md mx-auto">' +
        '<div class="w-16 h-16 rounded-[20px] bg-[#66CCFF]/10 border border-[#66CCFF]/20 flex items-center justify-center text-[#66CCFF] mb-5">' + icon('CloudUpload', 28) + '</div>' +
        '<div class="text-[16px] font-semibold">No file loaded</div>' +
        '<div class="text-[13px] text-white/45 mt-2 leading-[20px]">Upload a .json, .jsonl, .ljson or .ljsone file to start inspecting lines.</div>' +
        '<button data-action="upload" class="mt-6 h-[52px] min-h-[52px] px-8 rounded-[16px] bg-[#66CCFF] text-black font-semibold text-[14px] flex items-center gap-2 active:scale-[0.98]">Choose file ' + icon('ArrowUpRight', 16) + '</button>' +
    '</div>';
  }

  // ---- filter chips (types come from the actual file) -------------------
  const types = fileTypes();
  const chipDefs = [{ v: 'All', label: 'All' }]
    .concat(types.map((t) => ({ v: t, label: t })))
    .concat([{ v: '__errors', label: 'Errors' }]);
  const chips = chipDefs.map((c) => {
    const active = c.v === '__errors' ? state.errorsOnly : (!state.errorsOnly && state.typeFilter === c.v);
    return '<button data-action="chip" data-v="' + esc(c.v) + '" class="shrink-0 h-9 min-h-[36px] px-4 rounded-full text-[12px] border transition-colors active:scale-95 ' +
      (active ? 'bg-[#66CCFF] text-black border-[#66CCFF] font-medium' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10') + '">' + esc(c.label) + '</button>';
  }).join('');

  // ---- sort popover ------------------------------------------------------
  const sortOpts = Object.keys(SORTS).map((k) =>
    '<button data-action="sort-set" data-v="' + k + '" class="w-full text-left px-4 py-3 min-h-[44px] rounded-[12px] text-[13px] flex items-center justify-between active:bg-white/10 ' +
      (state.sort === k ? 'text-[#66CCFF] font-medium bg-[#66CCFF]/10' : 'text-white/70 hover:bg-white/5') + '">' +
      esc(SORTS[k].label) +
      (state.sort === k ? icon('Check', 14) : '') +
    '</button>'
  ).join('');
  const sortPop = state.sortOpen
    ? '<div data-sort-root class="absolute right-0 top-[calc(100%+8px)] z-30 w-[200px] rounded-[16px] bg-[#141F2E] border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.6)] p-1.5">' + sortOpts + '</div>'
    : '';

  const lines = visibleLines();
  const shown = lines.slice(0, state.renderLimit);
  const remaining = lines.length - shown.length;

  let listHTML;
  if (lines.length === 0) {
    listHTML =
      '<div class="py-20 text-center px-6">' +
        '<div class="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-3">' + icon('Search', 20, 'text-white/20') + '</div>' +
        '<div class="text-[13px] text-white/60">' + (state.search || state.typeFilter !== 'All' || state.errorsOnly ? 'No matches for the current filters' : 'This file has no lines') + '</div>' +
        '<div class="text-[11px] text-white/30 mt-1">Try another key, or clear search &amp; filters</div>' +
        ((state.search || state.typeFilter !== 'All' || state.errorsOnly)
          ? '<button data-action="clear-filters" class="mt-4 h-10 min-h-[40px] px-5 rounded-full bg-white/10 text-[12px] text-white/80 active:scale-95">Clear filters</button>'
          : '') +
      '</div>';
  } else {
    listHTML = '<div class="divide-y divide-white/[0.04]">' + shown.map((line) => {
      const expanded = state.expanded.has(line.uid);
      const isErr = !!line.error;
      let preview;
      if (isErr) {
        preview = '<span class="font-mono text-[11px] text-[#FF9A6C]">\u21B3 ' + esc(line.error) + '</span>';
      } else if (expanded) {
        preview = '<div class="rounded-[10px] bg-[#0E1722] border border-white/5 p-2.5 mt-1 overflow-hidden max-w-full">' + highlightJSON(line.raw) + '</div>';
      } else {
        preview = '<span class="font-mono text-[11px] text-white/40 block truncate max-w-[220px] sm:max-w-[320px] lg:max-w-[480px]">' + esc(line.raw.slice(0, 88)) + '\u2026</span>';
      }
      return '' +
      '<div class="group ' + (isErr ? 'bg-[#FF9A6C]/[0.06]' : 'hover:bg-white/[0.02]') + '">' +
        '<button data-action="toggle-line" data-uid="' + line.uid + '" class="w-full text-left flex items-start gap-3 px-4 py-3.5 min-h-[64px]">' +
          '<span class="font-mono text-[11px] text-white/20 mt-0.5 w-7 text-right shrink-0">' + String(line.n).padStart(3, '0') + '</span>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              typeBadge(line) +
              '<span class="text-[12px] font-mono text-white/80 truncate max-w-[110px] sm:max-w-[160px] lg:max-w-[220px]">' + esc(line.id) + '</span>' +
              (line.timestamp
                ? '<span class="ml-auto text-[10px] text-white/30 font-mono shrink-0">' + esc(line.timestamp.slice(11, 19) || line.timestamp) + '</span>'
                : '') +
            '</div>' +
            '<div class="mt-1.5">' + preview + '</div>' +
          '</div>' +
          '<div class="shrink-0 w-7 h-7 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center mt-0.5">' + icon('ChevronRight', 12, 'text-white/30 transition-transform ' + (expanded ? 'rotate-90' : '')) + '</div>' +
        '</button>' +
        '<div class="px-[52px] pb-3 flex gap-2">' +
          '<button data-action="inspect" data-uid="' + line.uid + '" class="h-9 min-h-[36px] px-3 rounded-full bg-white/5 hover:bg-white/10 text-[11px] text-white/70 flex items-center gap-1.5 active:scale-95">' + icon('Eye', 12) + ' Inspect</button>' +
          '<button data-action="copy-line" data-uid="' + line.uid + '" class="h-9 min-h-[36px] px-3 rounded-full bg-white/5 hover:bg-white/10 text-[11px] text-white/70 flex items-center gap-1.5 active:scale-95">' + icon('Copy', 12) + ' Copy</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
    if (remaining > 0) {
      listHTML +=
        '<div class="py-6 text-center">' +
          '<div class="text-[11px] text-white/30 mb-3 font-mono">showing ' + shown.length.toLocaleString() + ' of ' + lines.length.toLocaleString() + '</div>' +
          '<button data-action="show-more" class="h-11 min-h-[44px] px-6 rounded-full bg-white/10 hover:bg-white/15 text-[13px] text-white/80 active:scale-95">Show more (' + remaining.toLocaleString() + ' remaining)</button>' +
        '</div>';
    }
  }

  return '' +
  '<div class="py-6 lg:py-10">' +
    '<div class="sticky top-[72px] z-20 rounded-[16px] border border-white/[0.06] bg-[#0A0F18]/95 backdrop-blur px-4 py-3">' +
      '<div class="flex items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<div class="w-10 h-10 min-w-[40px] rounded-[10px] bg-[#121D2B] border border-white/10 flex items-center justify-center shrink-0">' + icon('Braces', 16, 'text-[#66CCFF]') + '</div>' +
          '<div class="min-w-0">' +
            '<div class="text-[13px] font-medium truncate max-w-[160px] sm:max-w-[200px]">' + esc(doc.name) + '</div>' +
            '<div class="text-[11px] text-white/40 flex items-center gap-2">' +
              '<span>' + lines.length.toLocaleString() + ' lines</span>' +
              '<span class="w-1 h-1 rounded-full bg-white/20"></span>' +
              '<span class="text-[#66CCFF]">virtualized</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div data-sort-root class="relative shrink-0">' +
          '<button data-action="sort-open" class="h-11 min-h-[44px] px-3.5 rounded-full bg-white/5 hover:bg-white/10 flex items-center gap-2 text-[12px] text-white/70 active:scale-95">' + icon('ArrowUpDown', 14) + ' <span class="hidden sm:inline">' + esc(SORTS[state.sort].label) + '</span></button>' +
          sortPop +
        '</div>' +
      '</div>' +
      '<div class="mt-4 relative">' +
        icon('Search', 16, 'absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none') +
        '<input id="search" type="text" value="' + esc(state.search) + '" placeholder="Search id, type, keys\u2026" autocomplete="off" class="w-full h-11 min-h-[44px] rounded-[12px] bg-[#111B28] border border-white/[0.06] pl-10 pr-10 text-[14px] placeholder:text-white/30 focus:outline-none focus:border-[#66CCFF]/40 focus:bg-[#121E2E]">' +
        (state.search ? '<button data-action="clear-search" class="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 min-w-[32px] min-h-[32px] rounded-full bg-white/10 flex items-center justify-center text-[12px] active:scale-90">\u2715</button>' : '') +
      '</div>' +
      '<div class="mt-3 flex gap-2 overflow-auto scrollbar-none pb-1">' + chips + '</div>' +
    '</div>' +

    '<div class="mt-2">' + listHTML + '</div>' +

    '<div class="mt-4 h-11 min-h-[44px] rounded-[14px] border border-white/[0.06] bg-[#0F1926]/95 backdrop-blur flex items-center justify-between px-4 text-[11px] text-white/40">' +
      '<span class="flex items-center gap-1.5 truncate"><span class="w-2 h-2 rounded-full bg-[#66CCFF] animate-pulse shrink-0"></span> ' + lines.length.toLocaleString() + ' visible</span>' +
      '<span class="font-mono">' + doc.lines.length.toLocaleString() + ' total</span>' +
    '</div>' +
  '</div>';
}

/** Table mode: flattened dot-path field/value rows for one parsed line. */
function tableHTML(parsed) {
  const rows = flattenJSON(parsed, '', []);
  const body = rows.map(([p, v]) =>
    '<div class="flex gap-3 px-3.5 py-2.5 border-b border-white/[0.04] last:border-0">' +
      '<div class="flex-1 min-w-0 font-mono text-[11px] text-[#7DD3FF] break-all">' + esc(p) + '</div>' +
      '<div class="flex-1 min-w-0 font-mono text-[11px] break-all text-right">' + cellValue(v) + '</div>' +
    '</div>'
  ).join('');
  return '' +
  '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] overflow-hidden">' +
    '<div class="flex gap-3 px-3.5 py-2.5 bg-white/[0.03] border-b border-white/[0.06] text-[10px] tracking-widest text-white/40 font-medium"><div class="flex-1">FIELD</div><div class="flex-1 text-right">VALUE</div></div>' +
    '<div class="max-h-[440px] overflow-auto scrollbar-none">' + body + '</div>' +
  '</div>';
}

/** Summary cards: the line's first scalar top-level fields (generic, not demo-specific). */
function summaryCardsHTML(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  const scalars = Object.entries(parsed)
    .filter(([, v]) => v === null || typeof v !== 'object')
    .slice(0, 4);
  const cards = scalars.length
    ? scalars.map(([k, v]) =>
        '<div class="rounded-[14px] bg-[#121D2B] border border-white/5 p-3 min-w-0">' +
          '<div class="text-[10px] tracking-widest text-white/30 truncate">' + esc(k).toUpperCase() + '</div>' +
          '<div class="text-[13px] font-mono mt-1 truncate">' + cellValue(v) + '</div>' +
        '</div>'
      ).join('')
    : '<div class="rounded-[14px] bg-[#121D2B] border border-white/5 p-3 col-span-2">' +
        '<div class="text-[10px] tracking-widest text-white/30">TOP-LEVEL KEYS</div>' +
        '<div class="text-[13px] font-mono mt-1">' + Object.keys(parsed).length + ' keys</div>' +
      '</div>';
  return '<div class="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">' + cards + '</div>';
}

function detailHTML() {
  const line = state.line;
  if (!line) {
    return '' +
    '<div class="py-20 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">' +
      '<div class="w-14 h-14 rounded-[18px] bg-white/5 flex items-center justify-center mb-4">' + icon('Braces', 24, 'text-white/20') + '</div>' +
      '<div class="text-[14px] font-medium">No line selected</div>' +
      '<div class="text-[12px] text-white/40 mt-1 max-w-[220px]">Tap Inspect on any line in the viewer to open detail view</div>' +
    '</div>';
  }

  const parsed = parseLine(line);
  const copyIcon = state.copied ? icon('Check', 14) : icon('Copy', 14);
  const copyLabel = state.copied ? 'Copied' : 'Copy';

  let body;
  if (line.error) {
    body =
      '<div class="rounded-[16px] bg-[#FF9A6C]/10 border border-[#FF9A6C]/20 p-4">' +
        '<div class="flex items-center gap-2 text-[#FF9A6C] text-[13px] font-medium">' + icon('TriangleAlert', 16) + ' Parse error</div>' +
        '<div class="mt-2 font-mono text-[12px] text-[#FF9A6C]/80">' + esc(line.error) + '</div>' +
        '<div class="mt-3 p-2.5 rounded-[10px] bg-black/20 font-mono text-[11px] text-white/60 break-all max-w-full">' + esc(line.raw) + '</div>' +
      '</div>';
  } else if (state.detailTab === 'tree') {
    body =
      '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-4 overflow-x-auto">' +
        (parsed ? treeHTML(parsed, '', 0) : '<span class="text-white/40">Invalid JSON</span>') +
      '</div>';
  } else if (state.detailTab === 'table') {
    body = parsed ? tableHTML(parsed)
      : '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-4 text-white/40">Invalid JSON</div>';
  } else {
    body =
      '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-4 overflow-auto max-w-full">' +
        '<pre class="font-mono text-[12px] leading-[18px] whitespace-pre-wrap break-all">' + highlightJSON(JSON.stringify(parsed, null, 2)) + '</pre>' +
      '</div>';
  }

  const tabBtn = (v, ic, label) =>
    '<button data-action="tab" data-v="' + v + '" class="h-9 min-h-[36px] px-3.5 rounded-full text-[12px] flex items-center gap-1.5 transition-colors active:scale-95 ' +
    (state.detailTab === v ? 'bg-white text-black font-medium' : 'text-white/50') + '">' + icon(ic, 14) + ' ' + label + '</button>';

  return '' +
  '<div class="py-6 lg:py-10">' +
    '<div class="pb-4 border-b border-white/[0.06] flex items-center gap-3">' +
      '<button data-action="back" class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 flex items-center justify-center shrink-0 active:scale-95">' + icon('ChevronLeft', 18) + '</button>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="text-[13px] font-mono font-medium truncate">' + esc(line.id) + '</div>' +
        '<div class="text-[11px] text-white/40 flex items-center gap-2 truncate"><span>' + esc(line.type) + '</span>' + (line.timestamp ? '<span>•</span><span class="truncate">' + esc(line.timestamp) + '</span>' : '') + '</div>' +
      '</div>' +
      '<button data-action="copy-detail" class="h-11 min-h-[44px] px-4 rounded-full bg-[#66CCFF] text-black text-[12px] font-medium flex items-center gap-1.5 shrink-0 active:scale-95">' + copyIcon + ' ' + copyLabel + '</button>' +
    '</div>' +

    '<div class="py-3 flex items-center justify-between gap-2">' +
      '<div class="flex bg-[#121D2B] border border-white/10 rounded-full p-1 gap-1 overflow-x-auto scrollbar-none">' +
        tabBtn('tree', 'GitBranch', 'Tree') +
        tabBtn('table', 'Table', 'Table') +
        tabBtn('raw', 'FileText', 'Raw') +
      '</div>' +
      '<div class="text-[11px] text-white/30 font-mono shrink-0">' + line.raw.length + ' chars</div>' +
    '</div>' +

    '<div>' +
      body +
      (line.error ? '' : summaryCardsHTML(parsed)) +
    '</div>' +
  '</div>';
}

function computeStats() {
  const lines = allLines();
  const types = {};
  const keyCounts = {};
  let errors = 0;
  let tMin = Infinity, tMax = -Infinity;
  for (const line of lines) {
    if (line.error) { errors++; continue; }
    types[line.type] = (types[line.type] || 0) + 1;
    const t = lineTime(line);
    if (!isNaN(t)) { if (t < tMin) tMin = t; if (t > tMax) tMax = t; }
    try {
      const obj = JSON.parse(line.raw);
      const walk = (o, prefix) => {
        if (o && typeof o === 'object') {
          for (const k of Object.keys(o)) {
            const p = prefix ? prefix + '.' + k : k;
            keyCounts[p] = (keyCounts[p] || 0) + 1;
            walk(o[k], p);
          }
        }
      };
      walk(obj, '');
    } catch (_) { /* already counted as error */ }
  }
  const keys = Object.entries(keyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([k]) => k);
  const span = tMin !== Infinity && tMax !== -Infinity && tMax > tMin
    ? fmtDuration(tMax - tMin) : null;
  return { total: lines.length, errors, types, keys, span,
    integrity: lines.length ? Math.round(((lines.length - errors) / lines.length) * 1000) / 10 : 100 };
}

/** Format a millisecond span as "3m 12s" / "2h 5m" / "4d". */
function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  if (h < 48) return h + 'h ' + (m % 60) + 'm';
  return Math.floor(h / 24) + 'd';
}

function statsHTML() {
  const doc = state.doc;

  if (!doc) {
    return '' +
    '<div class="py-20 lg:py-28 flex flex-col items-center justify-center px-8 text-center max-w-md mx-auto">' +
        '<div class="w-16 h-16 rounded-[20px] bg-[#66CCFF]/10 border border-[#66CCFF]/20 flex items-center justify-center text-[#66CCFF] mb-5">' + icon('ChartColumn', 28) + '</div>' +
        '<div class="text-[16px] font-semibold">No stats yet</div>' +
        '<div class="text-[13px] text-white/45 mt-2 leading-[20px]">Upload a file on Home and its type distribution, keys and integrity will appear here.</div>' +
        '<button data-action="nav" data-id="home" class="mt-6 h-[52px] min-h-[52px] px-8 rounded-[16px] bg-[#66CCFF] text-black font-semibold text-[14px] flex items-center gap-2 active:scale-[0.98]">Go to Home ' + icon('ArrowUpRight', 16) + '</button>' +
    '</div>';
  }

  const s = computeStats();
  const max = Math.max(1, ...Object.values(s.types));
  const rows = Object.entries(s.types)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => {
      const pct = Math.round((count / max) * 100);
      return '' +
      '<div class="flex items-center gap-3">' +
        '<span class="w-20 text-[11px] font-mono text-white/60 truncate">' + esc(type) + '</span>' +
        '<div class="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div class="h-full rounded-full bg-[#66CCFF]" style="width:' + pct + '%"></div></div>' +
        '<span class="w-10 text-[11px] font-mono text-white/40 text-right">' + count.toLocaleString() + '</span>' +
      '</div>';
    }).join('') || '<div class="text-[12px] text-white/40">No typed lines in this file.</div>';

  const keyChips = s.keys.map((k) =>
    '<span class="text-[11px] font-mono px-2.5 py-1 rounded-full bg-[#0E1722] border border-white/10 text-white/70">' + esc(k) + '</span>'
  ).join('') || '<span class="text-[12px] text-white/40">No keys found.</span>';

  return '' +
  '<div class="py-8 lg:py-12">' +
    '<h2 class="text-[28px] lg:text-[36px] font-semibold tracking-[-0.02em]">File Stats</h2>' +
    '<div class="text-[12px] text-white/40 mt-2 truncate">' + esc(doc.name) + ' &bull; analyzed on-device</div>' +

    '<div class="mt-8 space-y-4">' +
      '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">' +
        '<div class="rounded-[18px] bg-gradient-to-br from-[#66CCFF] to-[#4AA8D8] p-4 text-black">' +
          '<div class="text-[11px] tracking-widest opacity-70 flex items-center gap-1">' + icon('FileText', 12) + ' LINES</div>' +
          '<div class="text-[28px] font-[750] leading-none mt-2 tracking-[-0.03em]">' + s.total.toLocaleString() + '</div>' +
          '<div class="text-[11px] mt-2 opacity-70">' + esc(formatBytes(doc.sizeBytes)) + ' file</div>' +
          '<div class="mt-3 h-1.5 rounded-full bg-black/15 overflow-hidden"><div class="h-full bg-black/40 rounded-full" style="width:' + s.integrity + '%"></div></div>' +
        '</div>' +
        '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4">' +
          '<div class="text-[11px] text-white/40">AVG / LINE</div>' +
          '<div class="text-[18px] font-semibold mt-1">' + esc(formatBytes(s.total ? Math.round(doc.sizeBytes / s.total) : 0)) + '</div>' +
          '<div class="text-[10px] text-white/30 mt-1">parsed in ' + doc.parsedMs + ' ms</div>' +
        '</div>' +
        '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4 flex items-center justify-between">' +
          '<div>' +
            '<div class="text-[11px] text-white/40">ERROR LINES</div>' +
            '<div class="text-[18px] font-semibold mt-1 flex items-center gap-2">' + s.errors.toLocaleString() + ' <span class="w-2 h-2 rounded-full ' + (s.errors ? 'bg-[#FF9A6C]' : 'bg-[#C9F99A]') + '"></span></div>' +
          '</div>' +
          icon('TriangleAlert', 20, s.errors ? 'text-[#FF9A6C]' : 'text-white/20') +
        '</div>' +
        '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4">' +
          '<div class="text-[11px] text-white/40">INTEGRITY</div>' +
          '<div class="text-[18px] font-semibold mt-1 text-[#C9F99A]">' + s.integrity + '%</div>' +
          '<div class="text-[10px] text-white/30 mt-1">lines parsed clean</div>' +
        '</div>' +
      '</div>' +

      '<div class="grid gap-4 lg:grid-cols-2">' +

      '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="text-[13px] font-semibold">Type distribution</h3>' +
          '<span class="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/40">' + esc(doc.name.split('.').pop().toUpperCase()) + '</span>' +
        '</div>' +
        '<div class="space-y-3">' + rows + '</div>' +
      '</div>' +

      '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4">' +
        '<h3 class="text-[13px] font-semibold mb-3">Keys overview</h3>' +
        '<div class="flex flex-wrap gap-2">' + keyChips + '</div>' +
        '<div class="mt-4 grid grid-cols-3 gap-2 text-[11px]">' +
          '<div class="rounded-[10px] bg-white/[0.03] border border-white/5 p-2.5"><div class="text-white/30">Time span</div><div class="font-mono font-medium mt-1">' + (s.span || '&mdash;') + '</div></div>' +
          '<div class="rounded-[10px] bg-white/[0.03] border border-white/5 p-2.5"><div class="text-white/30">Integrity</div><div class="font-mono font-medium mt-1 text-[#C9F99A]">' + s.integrity + '%</div></div>' +
          '<div class="rounded-[10px] bg-white/[0.03] border border-white/5 p-2.5"><div class="text-white/30">Unique types</div><div class="font-mono font-medium mt-1">' + Object.keys(s.types).length + '</div></div>' +
        '</div>' +
      '</div>' +
      '</div>' +

      '<div class="rounded-[18px] bg-[#0E1722] border border-[#66CCFF]/20 p-4 flex gap-3">' +
        '<div class="w-9 h-9 min-w-[36px] rounded-full bg-[#66CCFF]/20 flex items-center justify-center text-[#66CCFF] shrink-0">' + icon('Snowflake', 16) + '</div>' +
        '<div class="text-[12px] leading-[18px] text-white/60"><span class="text-white font-medium">Tip:</span> malformed lines are kept in place and flagged &mdash; use the Errors filter on the Lines tab to jump straight to them.</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { id: 'home',   icon: 'House',       label: 'Home' },
  { id: 'viewer', icon: 'Layers',      label: 'Lines' },
  { id: 'detail', icon: 'Braces',      label: 'Inspect' },
  { id: 'stats',  icon: 'ChartColumn', label: 'Stats' },
];

function bottomNavHTML() {
  const items = NAV_ITEMS.map((item) => {
    const active = state.screen === item.id;
    return '' +
    '<button data-action="nav" data-id="' + item.id + '" class="relative flex flex-col items-center justify-center w-[68px] h-[52px] min-h-[44px] rounded-[16px] transition-all active:scale-95 ' +
      (active ? 'bg-white text-black' : 'text-white/45 hover:text-white/70') + '">' +
      icon(item.icon, 18) +
      '<span class="text-[10px] mt-1 tracking-wide leading-none ' + (active ? 'font-semibold' : 'font-medium') + '">' + item.label + '</span>' +
      (active ? '<span class="absolute -top-1 w-1 h-1 rounded-full bg-[#66CCFF]"></span>' : '') +
    '</button>';
  }).join('');

  // Fixed to the viewport on mobile only — desktop uses the top navbar.
  return '' +
  '<div class="fixed lg:hidden bottom-0 left-0 right-0 z-20 px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2 bg-gradient-to-t from-[#0A0F18] via-[#0A0F18]/90 to-transparent">' +
    '<div class="mx-auto max-w-[390px] h-[68px] min-h-[68px] rounded-[24px] bg-[#111B28]/95 backdrop-blur-[20px] border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center justify-around px-2">' +
      items +
    '</div>' +
  '</div>';
}

/* Sticky top navbar for the website layout (desktop links; mobile keeps the
   bottom nav island for navigation). */
function topNavHTML() {
  const pills = NAV_ITEMS.map((item) => {
    const active = state.screen === item.id;
    return '<button data-action="nav" data-id="' + item.id + '" class="h-9 min-h-[36px] px-4 rounded-full text-[12px] font-medium transition-colors ' +
      (active ? 'bg-white text-black' : 'text-white/50 hover:text-white/80 hover:bg-white/5') + '">' + item.label + '</button>';
  }).join('');
  return '' +
  '<header class="sticky top-0 z-30 bg-[#0A0F18]/90 backdrop-blur border-b border-white/[0.06]" style="padding-top:var(--safe-area-inset-top,0px)">' +
    '<div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">' +
      '<button data-action="nav" data-id="home" class="flex items-center gap-2 shrink-0 active:scale-95">' +
        '<div class="w-8 h-8 rounded-[10px] bg-[#66CCFF] text-black flex items-center justify-center">' + icon('Snowflake', 16) + '</div>' +
        '<span class="font-semibold tracking-[-0.01em] text-[14px]">ARTIC SHIFT</span>' +
      '</button>' +
      '<nav class="hidden lg:flex items-center gap-1 p-1 rounded-full bg-[#111B28] border border-white/10">' + pills + '</nav>' +
      '<button data-action="upload" class="lg:hidden h-10 min-h-[40px] px-4 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-medium flex items-center gap-1.5 active:scale-95">' + icon('CloudUpload', 14) + ' Upload</button>' +
    '</div>' +
  '</header>';
}

/* ------------------------------------------------------------------ */
/* App shell + render                                                  */
/* ------------------------------------------------------------------ */

function screenHTML() {
  switch (state.screen) {
    case 'onboarding': return onboardingHTML();
    case 'home':       return homeHTML();
    case 'viewer':     return viewerHTML();
    case 'detail':     return detailHTML();
    case 'stats':      return statsHTML();
    default:           return homeHTML();
  }
}

function render() {
  // Remember the search field so a re-render doesn't steal focus/typing.
  const active = document.activeElement;
  const keepFocus = active && active.id === 'search'
    ? { start: active.selectionStart, end: active.selectionEnd }
    : null;

  const showNav = state.screen !== 'onboarding';
  const showChrome = state.screen !== 'onboarding';

  document.getElementById('root').innerHTML =
  '<div class="min-h-[100dvh] w-full bg-[#0A0F18] text-white selection:bg-[#66CCFF]/30 overflow-x-clip antialiased flex flex-col" style="font-family:Geist, system-ui, -apple-system, sans-serif">' +
    // One global hidden picker: the navbar Upload button and every screen share it.
    '<input type="file" id="filepicker" accept=".json,.jsonl,.ljson,.ljsone" class="filepicker-visually-hidden" tabindex="-1">' +

    (showChrome ? topNavHTML() : '') +

    '<main class="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 flex flex-col">' +
      '<div class="animate-[fadeIn_0.3s_ease] flex-1 flex flex-col">' + screenHTML() + '</div>' +
    '</main>' +

    (showChrome
      ? '<footer class="mt-16 px-4 pb-[120px] lg:pb-10 text-center text-[11px] text-white/25 tracking-wide">Artic Shift &bull; private by design &mdash; files never leave your device &bull; icy blue #66CCFF</footer>'
      : '') +

    (showNav ? bottomNavHTML() : '') +

    (state.parsing
      ? '<div class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">' +
        '<div class="w-full max-w-[300px] rounded-[20px] bg-[#121D2B] border border-white/10 p-5 text-center">' +
          '<div class="w-11 h-11 mx-auto rounded-[14px] bg-[#66CCFF]/15 text-[#66CCFF] flex items-center justify-center mb-3">' + icon('FileJson', 20) + '</div>' +
          '<div class="text-[13px] font-medium truncate">' + esc(state.parsing.name) + '</div>' +
          '<div class="text-[11px] text-white/40 mt-1 mb-4">Parsing on-device&hellip;</div>' +
          '<div class="h-2 rounded-full bg-white/10 overflow-hidden"><div class="h-full rounded-full bg-[#66CCFF] transition-all" style="width:' + Math.round(state.parsing.pct) + '%"></div></div>' +
          '<div class="mt-2 text-[11px] font-mono text-white/40">' + Math.round(state.parsing.pct) + '%</div>' +
        '</div>' +
        '</div>'
      : '') +
  '</div>';

  if (keepFocus) {
    const input = document.getElementById('search');
    if (input) {
      input.focus();
      try { input.setSelectionRange(keepFocus.start, keepFocus.end); } catch (_) { /* ignore */ }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Events (single delegated listener)                                  */
/* ------------------------------------------------------------------ */

function go(screen) {
  state.screen = screen;
  state.copied = false;
  render();
  if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  // Close the sort popover when tapping anywhere outside it.
  const inSort = e.target.closest && e.target.closest('[data-sort-root]');
  const el = e.target.closest('[data-action]');
  let closedPop = false;
  if (state.sortOpen && !inSort) { state.sortOpen = false; closedPop = true; }
  if (!el) { if (closedPop) render(); return; }
  const action = el.dataset.action;
  haptic();

  switch (action) {
    case 'skip':
    case 'begin':
      go('home');
      break;
    case 'nav':
      go(el.dataset.id);
      break;
    case 'slide': {
      const dir = Number(el.dataset.dir);
      if (state.slide < 2 && dir > 0) state.slide++;
      else if (state.slide > 0 && dir < 0) state.slide--;
      else if (state.slide === 2 && dir > 0) { go('home'); break; }
      render();
      break;
    }
    case 'dot':
      state.slide = Number(el.dataset.i);
      render();
      break;
    case 'upload': {
      const picker = document.getElementById('filepicker');
      if (picker) picker.click();
      break;
    }
    case 'open-viewer':
      go('viewer');
      break;
    case 'remove-file':
      state.doc = null;
      state.line = null;
      state.search = '';
      state.typeFilter = 'All';
      state.errorsOnly = false;
      state.expanded.clear();
      go('home');
      break;
    case 'toggle-line': {
      const uid = Number(el.dataset.uid);
      if (state.expanded.has(uid)) state.expanded.delete(uid);
      else state.expanded.add(uid);
      render();
      break;
    }
    case 'inspect': {
      const line = allLines().find((x) => x.uid === Number(el.dataset.uid));
      if (line) { state.line = line; state.detailTab = 'tree'; state.treeToggled.clear(); }
      go('detail');
      break;
    }
    case 'copy-line': {
      const line = allLines().find((x) => x.uid === Number(el.dataset.uid));
      if (line) copyText(line.raw);
      break;
    }
    case 'clear-search':
      state.search = '';
      resetWindow();
      render();
      break;
    case 'clear-filters':
      state.search = '';
      state.typeFilter = 'All';
      state.errorsOnly = false;
      resetWindow();
      render();
      break;
    case 'chip': {
      const v = el.dataset.v;
      if (v === '__errors') {
        state.errorsOnly = true;
        state.typeFilter = 'All';
      } else {
        state.errorsOnly = false;
        state.typeFilter = v;
      }
      resetWindow();
      render();
      break;
    }
    case 'sort-open':
      state.sortOpen = !state.sortOpen;
      render();
      break;
    case 'sort-set':
      state.sort = el.dataset.v;
      state.sortOpen = false;
      resetWindow();
      render();
      break;
    case 'show-more':
      state.renderLimit += 500;
      render();
      break;
    case 'back':
      go('viewer');
      break;
    case 'copy-detail':
      if (state.line) {
        copyText(state.line.raw).then(() => {
          state.copied = true;
          render();
          setTimeout(() => { state.copied = false; render(); }, 1200);
        });
      }
      break;
    case 'tab':
      if (['tree', 'table', 'raw'].includes(el.dataset.v)) state.detailTab = el.dataset.v;
      render();
      break;
    case 'tree-toggle': {
      const path = el.dataset.path;
      if (state.treeToggled.has(path)) state.treeToggled.delete(path);
      else state.treeToggled.add(path);
      render();
      break;
    }
  }
  // If the tap only closed the sort popover (e.g. a non-rendering action
  // like copy-line), paint once so it disappears.
  if (closedPop && action !== 'sort-open' && action !== 'sort-set') render();
});

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'search') {
    state.search = e.target.value;
    resetWindow();
    render();
  }
});

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'filepicker') {
    handleFiles(e.target.files);
    e.target.value = ''; // allow picking the same file again
  }
});

document.addEventListener('keydown', (e) => {
  const dz = e.target.closest && e.target.closest('#dropzone');
  if (dz && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    haptic();
    const picker = document.getElementById('filepicker');
    if (picker) picker.click();
  }
});

// Drag & drop on the home dropzone: highlight + parse the dropped file.
document.addEventListener('dragover', (e) => {
  const dz = e.target.closest && e.target.closest('#dropzone');
  if (dz) { e.preventDefault(); if (!state.dragOver) { state.dragOver = true; render(); } }
});
document.addEventListener('dragleave', (e) => {
  const dz = e.target.closest && e.target.closest('#dropzone');
  if (dz && state.dragOver) { state.dragOver = false; render(); }
});
document.addEventListener('drop', (e) => {
  const dz = e.target.closest && e.target.closest('#dropzone');
  if (dz) {
    e.preventDefault();
    state.dragOver = false;
    haptic();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    } else {
      render();
    }
  }
});

/* ------------------------------------------------------------------ */
/* File intake (chunked so big files don't freeze the UI)               */
/* ------------------------------------------------------------------ */

function handleFiles(files) {
  const f = files && files[0];
  if (!f) return;
  state.fileError = '';
  if (f.size > MAX_FILE_BYTES) {
    state.fileError = '\u201C' + f.name + '\u201D is ' + formatBytes(f.size) +
      ' \u2014 files are capped at 50MB so parsing stays smooth on-device.';
    render();
    return;
  }
  if (!/\.(json|jsonl|ljson|ljsone)$/i.test(f.name)) {
    state.fileError = '\u201C' + f.name + '\u201D doesn\u2019t look like a JSON file. ' +
      'Supported: .json, .jsonl, .ljson, .ljsone';
    render();
    return;
  }
  state.parsing = { name: f.name, pct: 0 };
  render();

  const reader = new FileReader();
  reader.onerror = () => {
    state.parsing = null;
    state.fileError = 'Couldn\u2019t read \u201C' + f.name + '\u201D. Try again.';
    render();
  };
  reader.onload = () => {
    const text = String(reader.result || '');
    parseInChunks(f, text);
  };
  reader.readAsText(f);
}

/** Parse text in slices, yielding to the UI with a progress bar. */
function parseInChunks(file, text) {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const ext = String(file.name).split('.').pop().toLowerCase();
  const trimmed = text.trim();

  // Fast path for .json with a top-level array/object (no line splitting).
  if (ext === 'json' && (trimmed[0] === '[' || trimmed[0] === '{')) {
    state.parsing.pct = 60;
    render();
    setTimeout(() => {
      const lines = parseFileContent(file.name, text);
      finishParse(file, lines, t0);
    }, 30);
    return;
  }

  const rawLines = text.split(/\r?\n/);
  const lines = [];
  let i = 0, n = 0;
  const CHUNK = 4000;
  const step = () => {
    const end = Math.min(i + CHUNK, rawLines.length);
    for (; i < end; i++) {
      const rl = rawLines[i];
      if (!rl.trim()) continue;
      n++;
      try {
        lines.push(makeLine(lines.length, n, rl, JSON.parse(rl)));
      } catch (err) {
        lines.push(makeLine(lines.length, n, rl, undefined, 'Line ' + n + ': ' + err.message));
      }
    }
    state.parsing.pct = (i / rawLines.length) * 100;
    render();
    if (i < rawLines.length) {
      setTimeout(step, 0);
    } else {
      finishParse(file, lines, t0);
    }
  };
  setTimeout(step, 30);
}

function finishParse(file, lines, t0) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  state.parsing = null;
  if (!lines.length) {
    state.fileError = '\u201C' + file.name + '\u201D has no readable JSON lines.';
    render();
    return;
  }
  state.doc = {
    name: file.name,
    sizeBytes: file.size,
    lines,
    parsedMs: Math.max(1, Math.round(now - t0)),
  };
  state.line = null;
  state.search = '';
  state.typeFilter = 'All';
  state.errorsOnly = false;
  state.sort = 'line';
  state.expanded.clear();
  state.treeToggled.clear();
  resetWindow();
  go('viewer');
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

// Deep-link support: ?screen=viewer (handy for testing / sharing a view).
try {
  const qs = new URLSearchParams(window.location.search);
  const s = qs.get('screen');
  if (s && ['onboarding', 'home', 'viewer', 'detail', 'stats'].includes(s)) {
    state.screen = s;
  }
} catch (_) { /* ignore */ }

render();
