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
/* Demo data (ships with the mockup so every screen has content)        */
/* ------------------------------------------------------------------ */

const FILES = [
  { id: 'f1', name: 'arctic_shift_2024.ljsone', lines: 1247, size: '2.4 MB', time: '2h ago',    status: 'ok',   errors: 0 },
  { id: 'f2', name: 'shift_nodes.jsonl',         lines: 892,  size: '1.1 MB', time: 'yesterday', status: 'warn', errors: 3 },
  { id: 'f3', name: 'buoy_stream_0312.json',     lines: 2103, size: '4.7 MB', time: 'Mar 11',    status: 'ok',   errors: 0 },
  { id: 'f4', name: 'thermal_drift.ljson',       lines: 156,  size: '312 KB', time: 'Mar 10',    status: 'ok',   errors: 0 },
];

const LINE_TEMPLATES = [
  { id: 'shift_001', timestamp: '2024-03-12T08:12:33Z', type: 'thermal',
    raw: '{"id":"shift_001","timestamp":"2024-03-12T08:12:33Z","type":"thermal","data":{"lat":71.294,"lon":-156.789,"temp":-32.4,"shift":0.42},"meta":{"source":"buoy_A12","ver":2}}',
    data: { lat: 71.294, lon: -156.789, temp: -32.4, shift: 0.42 }, meta: { source: 'buoy_A12', ver: 2 } },
  { id: 'shift_002', timestamp: '2024-03-12T08:13:01Z', type: 'drift',
    raw: '{"id":"shift_002","timestamp":"2024-03-12T08:13:01Z","type":"drift","data":{"vector":[0.12,-0.08],"ice_thick":1.8,"velocity":0.04}}',
    data: { vector: [0.12, -0.08], ice_thick: 1.8, velocity: 0.04 }, meta: { source: 'buoy_A12' } },
  { id: 'shift_003', timestamp: '2024-03-12T08:13:45Z', type: 'pressure',
    raw: '{"id":"shift_003","timestamp":"2024-03-12T08:13:45Z","type":"pressure","data":{"hPa":1012.3,"delta":-2.1,"trend":"falling"}}',
    data: { hPa: 1012.3, delta: -2.1, trend: 'falling' } },
  { id: 'shift_004', timestamp: '2024-03-12T08:14:12Z', type: 'thermal',
    raw: '{"id":"shift_004","timestamp":"2024-03-12T08:14:12Z","type":"thermal","data":{"lat":71.301,"lon":-156.802,"temp":-33.1,"shift":0.51}}',
    data: { lat: 71.301, lon: -156.802, temp: -33.1, shift: 0.51 } },
  { id: 'shift_005', timestamp: '2024-03-12T08:14:50Z', type: 'error',
    raw: '{"id":"shift_005","timestamp":"2024-03-12T08:14:50Z","type":',
    error: 'Unexpected end of JSON input' },
  { id: 'shift_006', timestamp: '2024-03-12T08:15:22Z', type: 'ice_core',
    raw: '{"id":"shift_006","timestamp":"2024-03-12T08:15:22Z","type":"ice_core","data":{"depth":12.4,"salinity":4.2,"density":0.91,"layers":6}}',
    data: { depth: 12.4, salinity: 4.2, density: 0.91, layers: 6 } },
  { id: 'shift_007', timestamp: '2024-03-12T08:16:00Z', type: 'drift',
    raw: '{"id":"shift_007","timestamp":"2024-03-12T08:16:00Z","type":"drift","data":{"vector":[0.09,-0.11],"ice_thick":1.82,"velocity":0.05}}',
    data: { vector: [0.09, -0.11], ice_thick: 1.82, velocity: 0.05 } },
  { id: 'shift_008', timestamp: '2024-03-12T08:16:44Z', type: 'thermal',
    raw: '{"id":"shift_008","timestamp":"2024-03-12T08:16:44Z","type":"thermal","data":{"lat":71.31,"lon":-156.81,"temp":-31.8,"shift":0.38}}',
    data: { lat: 71.31, lon: -156.81, temp: -31.8, shift: 0.38 } },
];

/** Build the 28 demo lines by cycling the templates and renumbering ids. */
function buildDemoLines() {
  return Array.from({ length: 28 }, (_, t) => {
    const tpl = LINE_TEMPLATES[t % LINE_TEMPLATES.length];
    const id = 'shift_' + String(t + 1).padStart(3, '0');
    return Object.assign({}, tpl, {
      id,
      raw: tpl.raw.replace(/shift_\d+/, id),
    });
  });
}
const LINES = buildDemoLines();

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
  file: FILES[0],         // selected demo file
  line: LINES[0],         // line open in the detail view
  search: '',             // viewer search query
  expanded: new Set(['shift_001']),  // expanded line ids in the viewer
  detailTab: 'tree',      // detail view tab: tree | raw
  copied: false,          // detail copy-button feedback
  treeToggled: new Set(), // tree node paths the user explicitly toggled
  dragOver: false,        // dropzone drag state
};

/** Lines matching the current search query. */
function filteredLines() {
  const q = state.search.trim().toLowerCase();
  if (!q) return LINES;
  return LINES.filter((l) =>
    l.id.toLowerCase().includes(q) ||
    l.type.toLowerCase().includes(q) ||
    l.raw.toLowerCase().includes(q)
  );
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
  '<div class="h-full w-full bg-[#0A0F18] relative overflow-hidden flex flex-col overflow-x-hidden">' +
    '<div class="absolute -top-[120px] -left-[80px] w-[340px] h-[340px] bg-[#66CCFF]/25 rounded-full blur-[80px] pointer-events-none"></div>' +
    '<div class="absolute top-[180px] -right-[100px] w-[300px] h-[300px] bg-[#66CCFF]/15 rounded-full blur-[70px] pointer-events-none"></div>' +
    '<div class="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-t from-[#66CCFF]/10 to-transparent pointer-events-none"></div>' +

    '<div class="relative z-10 px-6 pt-[calc(14px+var(--safe-area-inset-top,0px))] lg:pt-14 flex justify-between items-center shrink-0">' +
      '<div class="flex items-center gap-2">' +
        '<div class="w-8 h-8 rounded-[10px] bg-white text-black flex items-center justify-center">' + icon('Snowflake', 18) + '</div>' +
        '<span class="font-semibold tracking-[-0.02em] text-[15px]">ARTIC SHIFT</span>' +
      '</div>' +
      '<button data-action="skip" class="min-h-[44px] min-w-[44px] px-3 flex items-center justify-center text-[12px] tracking-widest text-white/50 hover:text-white/80 rounded-full">SKIP</button>' +
    '</div>' +

    '<div class="relative z-10 flex-1 px-6 flex flex-col pt-6 overflow-auto scrollbar-none">' +
      '<div class="flex-1 flex flex-col">' +
        '<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#66CCFF]/10 border border-[#66CCFF]/20 text-[11px] tracking-widest text-[#66CCFF] mb-6 self-start">' +
          '<span class="w-1.5 h-1.5 rounded-full bg-[#66CCFF] animate-pulse"></span>LJSON • JSONL • LJSONE' +
        '</div>' +
        '<h1 class="text-[32px] sm:text-[36px] font-[750] leading-[0.95] tracking-[-0.04em] mb-4 max-w-[320px]">Shift through<br><span class="text-[#66CCFF]">Arctic data</span><br>like ice.</h1>' +
        '<p class="text-[14px] leading-[22px] text-white/55 max-w-[300px]">' + esc(SLIDES[state.slide]) + '</p>' +

        '<div class="mt-6 sm:mt-8 relative">' +
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

      '<div class="pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-6 shrink-0">' +
        '<div class="flex items-center justify-between mb-5">' +
          '<div class="flex gap-1.5">' + dots + '</div>' +
          '<div class="flex gap-2">' +
            (state.slide > 0
              ? '<button data-action="slide" data-dir="-1" class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 flex items-center justify-center active:scale-95">' + icon('ChevronLeft', 18) + '</button>'
              : '') +
            '<button data-action="slide" data-dir="1" class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white text-black flex items-center justify-center active:scale-95">' + icon('ChevronRight', 18) + '</button>' +
          '</div>' +
        '</div>' +
        '<button data-action="begin" class="w-full h-[56px] min-h-[56px] rounded-[18px] bg-[#66CCFF] text-black font-semibold text-[15px] tracking-[-0.01em] flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(102,204,255,0.35)] hover:bg-[#7DD3FF] active:scale-[0.98] transition-all">Begin Shift ' + icon('ArrowUpRight', 18) + '</button>' +
        '<div class="mt-3 text-center text-[11px] text-white/30 px-2">No data leaves your device • offline-first • tap to browse on mobile</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function homeHTML() {
  const fileRows = FILES.map((f) =>
    '<button data-action="select-file" data-id="' + f.id + '" class="w-full text-left rounded-[16px] bg-[#121D2B] border border-white/[0.05] p-3.5 flex items-center gap-3 hover:bg-[#162233] hover:border-white/10 transition-colors active:scale-[0.99]">' +
      '<div class="w-11 h-11 min-w-[44px] rounded-[12px] bg-[#0E1722] border border-white/5 flex items-center justify-center text-[#66CCFF] shrink-0">' + icon('FileJson', 18) + '</div>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="text-[13px] font-medium truncate flex items-center gap-2">' +
          '<span class="truncate">' + esc(f.name) + '</span>' +
          (f.status === 'warn' ? '<span class="w-1.5 h-1.5 rounded-full bg-[#FF9A6C] animate-pulse shrink-0"></span>' : '') +
        '</div>' +
        '<div class="flex items-center gap-2 sm:gap-3 mt-1 text-[11px] text-white/45 flex-wrap">' +
          '<span class="flex items-center gap-1">' + icon('HardDrive', 10) + ' ' + esc(f.size) + '</span>' +
          '<span class="flex items-center gap-1">' + icon('FileText', 10) + ' ' + f.lines.toLocaleString() + '</span>' +
          '<span class="flex items-center gap-1">' + icon('Clock', 10) + ' ' + esc(f.time) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">' + icon('ChevronRight', 14, 'text-white/40') + '</div>' +
    '</button>'
  ).join('');

  const dropCls = state.dragOver
    ? 'border-[#66CCFF] bg-[#66CCFF]/10'
    : 'border-white/10 bg-[#121B27] hover:border-[#66CCFF]/40 hover:bg-[#121B27]/80';

  return '' +
  '<div class="h-full w-full bg-[#0A0F18] flex flex-col overflow-x-hidden">' +
    '<div class="px-5 sm:px-6 pt-[calc(16px+var(--safe-area-inset-top,0px))] lg:pt-14 pb-4 shrink-0">' +
      '<div class="flex items-center justify-between">' +
        '<div>' +
          '<div class="text-[12px] tracking-widest text-white/40">WELCOME BACK</div>' +
          '<h2 class="text-[22px] font-semibold tracking-[-0.02em]">Arctic Lab</h2>' +
        '</div>' +
        '<div class="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-[#1A2636] border border-white/10 flex items-center justify-center"><span class="text-[12px]">A</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="flex-1 overflow-auto px-4 sm:px-5 pb-[100px] space-y-5 scrollbar-none">' +
      '<div id="dropzone" role="button" tabindex="0" data-action="upload" class="group rounded-[20px] border-2 border-dashed p-5 transition-all cursor-pointer min-h-[110px] flex flex-col justify-center active:scale-[0.99] ' + dropCls + '">' +
        '<div class="flex items-center gap-4">' +
          '<div class="w-12 h-12 min-w-[48px] rounded-[14px] bg-[#66CCFF]/15 flex items-center justify-center text-[#66CCFF] group-hover:scale-105 transition-transform">' + icon('CloudUpload', 22) + '</div>' +
          '<div class="flex-1">' +
            '<div class="text-[15px] font-medium leading-tight">Drop .jsonl / .ljsone here</div>' +
            '<div class="text-[12px] text-white/45 mt-1">Tap to browse on mobile • up to 50MB</div>' +
          '</div>' +
          '<div class="w-11 h-11 min-w-[44px] rounded-full bg-white/10 flex items-center justify-center shrink-0">' + icon('ArrowUpRight', 14) + '</div>' +
        '</div>' +
        '<div class="mt-4 flex gap-2 flex-wrap">' +
          ['.json', '.jsonl', '.ljsone'].map((ext) =>
            '<span class="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">' + ext + '</span>'
          ).join('') +
        '</div>' +
      '</div>' +

      '<div class="grid grid-cols-3 gap-3">' +
        '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-3">' +
          '<div class="text-[11px] text-white/40 flex items-center gap-1">' + icon('Database', 12) + ' FILES</div>' +
          '<div class="text-[20px] font-semibold mt-1 leading-none">12</div>' +
          '<div class="text-[10px] text-[#66CCFF]">+3 this week</div>' +
        '</div>' +
        '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-3">' +
          '<div class="text-[11px] text-white/40 flex items-center gap-1">' + icon('FileText', 12) + ' LINES</div>' +
          '<div class="text-[20px] font-semibold mt-1 leading-none">18.4k</div>' +
          '<div class="text-[10px] text-white/40">avg 1.2k/file</div>' +
        '</div>' +
        '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-3">' +
          '<div class="text-[11px] text-white/40 flex items-center gap-1">' + icon('TriangleAlert', 12) + ' ERRORS</div>' +
          '<div class="text-[20px] font-semibold mt-1 leading-none">3</div>' +
          '<div class="text-[10px] text-[#FF9A6C]">needs review</div>' +
        '</div>' +
      '</div>' +

      '<div>' +
        '<div class="flex items-center justify-between mb-3">' +
          '<h3 class="text-[13px] font-semibold tracking-wide text-white/80">RECENT FILES</h3>' +
          '<button class="text-[11px] text-white/40 flex items-center gap-1 min-h-[32px] px-2">View all ' + icon('ChevronRight', 12) + '</button>' +
        '</div>' +
        '<div class="space-y-2.5">' + fileRows + '</div>' +
      '</div>' +

      '<div class="rounded-[16px] bg-gradient-to-br from-[#66CCFF]/15 to-[#66CCFF]/5 border border-[#66CCFF]/20 p-4 flex gap-3">' +
        '<div class="w-9 h-9 min-w-[36px] rounded-full bg-[#66CCFF] text-black flex items-center justify-center shrink-0">' + icon('Sparkles', 16) + '</div>' +
        '<div>' +
          '<div class="text-[13px] font-medium">Pro tip</div>' +
          '<div class="text-[12px] text-white/60 leading-[18px] mt-1">Long-press any line in viewer to quick-copy its ID. Swipe left for tree view.</div>' +
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
  const lines = filteredLines();
  const chips = ['All', 'thermal', 'drift', 'ice_core', 'errors'].map((c) => {
    const active = state.search === c || (c === 'All' && !state.search);
    return '<button data-action="chip" data-v="' + c + '" class="shrink-0 h-9 min-h-[36px] px-4 rounded-full text-[12px] border transition-colors active:scale-95 ' +
      (active ? 'bg-[#66CCFF] text-black border-[#66CCFF] font-medium' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10') + '">' + c + '</button>';
  }).join('');

  let listHTML;
  if (lines.length === 0) {
    listHTML =
      '<div class="py-20 text-center">' +
        '<div class="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-3">' + icon('Search', 20, 'text-white/20') + '</div>' +
        '<div class="text-[13px] text-white/60">No matches for &quot;' + esc(state.search) + '&quot;</div>' +
        '<div class="text-[11px] text-white/30 mt-1">Try another key or clear filter</div>' +
      '</div>';
  } else {
    listHTML = '<div class="divide-y divide-white/[0.04]">' + lines.map((line, d) => {
      const expanded = state.expanded.has(line.id);
      const isErr = !!line.error;
      let preview;
      if (isErr) {
        preview = '<span class="font-mono text-[11px] text-[#FF9A6C]">↳ ' + esc(line.error) + '</span>';
      } else if (expanded) {
        preview = '<div class="rounded-[10px] bg-[#0E1722] border border-white/5 p-2.5 mt-1 overflow-hidden max-w-full">' + highlightJSON(line.raw) + '</div>';
      } else {
        preview = '<span class="font-mono text-[11px] text-white/40 block truncate max-w-[220px] sm:max-w-[260px]">' + esc(line.raw.slice(0, 88)) + '…</span>';
      }
      return '' +
      '<div class="group ' + (isErr ? 'bg-[#FF9A6C]/[0.06]' : 'hover:bg-white/[0.02]') + '">' +
        '<button data-action="toggle-line" data-id="' + line.id + '" class="w-full text-left flex items-start gap-3 px-4 py-3.5 min-h-[64px]">' +
          '<span class="font-mono text-[11px] text-white/20 mt-0.5 w-7 text-right shrink-0">' + String(d + 1).padStart(3, '0') + '</span>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              typeBadge(line) +
              '<span class="text-[12px] font-mono text-white/80 truncate max-w-[110px] sm:max-w-[140px]">' + esc(line.id) + '</span>' +
              '<span class="ml-auto text-[10px] text-white/30 font-mono shrink-0">' + esc(line.timestamp.slice(11, 19)) + '</span>' +
            '</div>' +
            '<div class="mt-1.5">' + preview + '</div>' +
          '</div>' +
          '<div class="shrink-0 w-7 h-7 rounded-full bg-white/5 group-hover:bg-white/10 flex items-center justify-center mt-0.5">' + icon('ChevronRight', 12, 'text-white/30 transition-transform ' + (expanded ? 'rotate-90' : '')) + '</div>' +
        '</button>' +
        '<div class="px-[52px] pb-3 flex gap-2">' +
          '<button data-action="inspect" data-id="' + line.id + '" class="h-9 min-h-[36px] px-3 rounded-full bg-white/5 hover:bg-white/10 text-[11px] text-white/70 flex items-center gap-1.5 active:scale-95">' + icon('Eye', 12) + ' Inspect</button>' +
          '<button data-action="copy-line" data-id="' + line.id + '" class="h-9 min-h-[36px] px-3 rounded-full bg-white/5 hover:bg-white/10 text-[11px] text-white/70 flex items-center gap-1.5 active:scale-95">' + icon('Copy', 12) + ' Copy</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  return '' +
  '<div class="h-full w-full bg-[#0A0F18] flex flex-col overflow-x-hidden">' +
    '<div class="px-4 sm:px-5 pt-[calc(16px+var(--safe-area-inset-top,0px))] lg:pt-14 pb-3 border-b border-white/[0.06] bg-[#0A0F18]/90 backdrop-blur shrink-0">' +
      '<div class="flex items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<div class="w-10 h-10 min-w-[40px] rounded-[10px] bg-[#121D2B] border border-white/10 flex items-center justify-center shrink-0">' + icon('Braces', 16, 'text-[#66CCFF]') + '</div>' +
          '<div class="min-w-0">' +
            '<div class="text-[13px] font-medium truncate max-w-[160px] sm:max-w-[200px]">' + esc(state.file.name || 'arctic_shift_2024.ljsone') + '</div>' +
            '<div class="text-[11px] text-white/40 flex items-center gap-2">' +
              '<span>' + lines.length + ' lines</span>' +
              '<span class="w-1 h-1 rounded-full bg-white/20"></span>' +
              '<span class="text-[#66CCFF]">virtualized</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/5 flex items-center justify-center shrink-0 active:scale-95">' + icon('Ellipsis', 16) + '</button>' +
      '</div>' +
      '<div class="mt-4 relative">' +
        icon('Search', 16, 'absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none') +
        '<input id="search" type="text" value="' + esc(state.search) + '" placeholder="Search id, type, keys…" autocomplete="off" class="w-full h-11 min-h-[44px] rounded-[12px] bg-[#111B28] border border-white/[0.06] pl-10 pr-10 text-[14px] placeholder:text-white/30 focus:outline-none focus:border-[#66CCFF]/40 focus:bg-[#121E2E]">' +
        (state.search ? '<button data-action="clear-search" class="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 min-w-[32px] min-h-[32px] rounded-full bg-white/10 flex items-center justify-center text-[12px] active:scale-90">✕</button>' : '') +
      '</div>' +
      '<div class="mt-3 flex gap-2 overflow-auto scrollbar-none pb-1">' + chips + '</div>' +
    '</div>' +

    '<div class="flex-1 overflow-auto scrollbar-none overflow-x-hidden">' + listHTML + '</div>' +

    '<div class="h-11 min-h-[44px] border-t border-white/[0.06] bg-[#0F1926] flex items-center justify-between px-4 text-[11px] text-white/40 shrink-0">' +
      '<span class="flex items-center gap-1.5 truncate"><span class="w-2 h-2 rounded-full bg-[#66CCFF] animate-pulse shrink-0"></span> Live parse • ' + lines.length + ' visible</span>' +
      '<span class="font-mono">' + (state.file.lines || 1247) + ' total</span>' +
    '</div>' +
  '</div>';
}

function detailHTML() {
  const line = state.line;
  if (!line) {
    return '' +
    '<div class="h-full bg-[#0A0F18] flex flex-col items-center justify-center p-8 text-center overflow-x-hidden">' +
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
  } else {
    body =
      '<div class="rounded-[16px] bg-[#111B28] border border-white/[0.06] p-4 overflow-auto max-w-full">' +
        '<pre class="font-mono text-[12px] leading-[18px] whitespace-pre-wrap break-all">' + highlightJSON(JSON.stringify(parsed, null, 2)) + '</pre>' +
      '</div>';
  }

  const lat = parsed && parsed.data ? parsed.data.lat : undefined;
  const lon = parsed && parsed.data ? parsed.data.lon : undefined;
  const delta = parsed && parsed.data ? (parsed.data.shift ?? parsed.data.velocity ?? '0.0') : '0.0';

  return '' +
  '<div class="h-full w-full bg-[#0A0F18] flex flex-col overflow-x-hidden">' +
    '<div class="px-4 sm:px-5 pt-[calc(16px+var(--safe-area-inset-top,0px))] lg:pt-14 pb-4 border-b border-white/[0.06] flex items-center gap-3 shrink-0">' +
      '<button data-action="back" class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 flex items-center justify-center shrink-0 active:scale-95">' + icon('ChevronLeft', 18) + '</button>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="text-[13px] font-mono font-medium truncate">' + esc(line.id) + '</div>' +
        '<div class="text-[11px] text-white/40 flex items-center gap-2 truncate"><span>' + esc(line.type) + '</span><span>•</span><span class="truncate">' + esc(line.timestamp) + '</span></div>' +
      '</div>' +
      '<button data-action="copy-detail" class="h-11 min-h-[44px] px-4 rounded-full bg-[#66CCFF] text-black text-[12px] font-medium flex items-center gap-1.5 shrink-0 active:scale-95">' + copyIcon + ' ' + copyLabel + '</button>' +
    '</div>' +

    '<div class="px-4 sm:px-5 py-3 flex items-center justify-between shrink-0">' +
      '<div class="flex bg-[#121D2B] border border-white/10 rounded-full p-1 gap-1">' +
        '<button data-action="tab" data-v="tree" class="h-9 min-h-[36px] px-4 rounded-full text-[12px] flex items-center gap-1.5 transition-colors active:scale-95 ' + (state.detailTab === 'tree' ? 'bg-white text-black font-medium' : 'text-white/50') + '">' + icon('GitBranch', 14) + ' Tree</button>' +
        '<button data-action="tab" data-v="raw" class="h-9 min-h-[36px] px-4 rounded-full text-[12px] flex items-center gap-1.5 transition-colors active:scale-95 ' + (state.detailTab === 'raw' ? 'bg-white text-black font-medium' : 'text-white/50') + '">' + icon('FileText', 14) + ' Raw</button>' +
      '</div>' +
      '<div class="text-[11px] text-white/30 font-mono shrink-0 ml-2">' + line.raw.length + ' chars</div>' +
    '</div>' +

    '<div class="flex-1 overflow-auto px-4 sm:px-5 pb-[100px] scrollbar-none">' +
      body +
      '<div class="mt-5 grid grid-cols-2 gap-3">' +
        '<div class="rounded-[14px] bg-[#121D2B] border border-white/5 p-3">' +
          '<div class="text-[10px] tracking-widest text-white/30">LAT / LON</div>' +
          '<div class="text-[13px] font-mono mt-1">' + (lat ?? '—') + ', ' + (lon ?? '—') + '</div>' +
        '</div>' +
        '<div class="rounded-[14px] bg-[#121D2B] border border-white/5 p-3">' +
          '<div class="text-[10px] tracking-widest text-white/30">SHIFT DELTA</div>' +
          '<div class="text-[13px] font-mono mt-1 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#66CCFF]"></span> ' + delta + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function computeStats() {
  const types = {};
  const keys = new Set();
  let errors = 0;
  for (const line of LINES) {
    if (line.error) errors++;
    types[line.type] = (types[line.type] || 0) + 1;
    try {
      const obj = JSON.parse(line.raw);
      Object.keys(obj).forEach((k) => keys.add(k));
      if (obj.data) Object.keys(obj.data).forEach((k) => keys.add('data.' + k));
    } catch (_) { /* error lines have no keys */ }
  }
  return { total: LINES.length, errors, types, keys: Array.from(keys) };
}

function statsHTML() {
  const s = computeStats();
  const max = Math.max(...Object.values(s.types));
  const rows = Object.entries(s.types).map(([type, count]) => {
    const pct = Math.round((count / max) * 100);
    return '' +
    '<div class="flex items-center gap-3">' +
      '<span class="w-16 text-[11px] font-mono text-white/60">' + esc(type) + '</span>' +
      '<div class="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div class="h-full rounded-full bg-[#66CCFF]" style="width:' + pct + '%"></div></div>' +
      '<span class="w-6 text-[11px] font-mono text-white/40 text-right">' + count + '</span>' +
    '</div>';
  }).join('');

  const keyChips = s.keys.slice(0, 18).map((k) =>
    '<span class="text-[11px] font-mono px-2.5 py-1 rounded-full bg-[#0E1722] border border-white/10 text-white/70">' + esc(k) + '</span>'
  ).join('');

  return '' +
  '<div class="h-full w-full bg-[#0A0F18] flex flex-col overflow-x-hidden">' +
    '<div class="px-5 sm:px-6 pt-[calc(16px+var(--safe-area-inset-top,0px))] lg:pt-14 pb-4 shrink-0">' +
      '<h2 class="text-[22px] font-semibold tracking-[-0.02em]">File Stats</h2>' +
      '<div class="text-[12px] text-white/40 mt-1 truncate">' + esc(state.file.name || 'arctic_shift_2024.ljsone') + ' • analyzed offline</div>' +
    '</div>' +

    '<div class="flex-1 overflow-auto px-4 sm:px-5 pb-[100px] space-y-4 scrollbar-none">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div class="rounded-[18px] bg-gradient-to-br from-[#66CCFF] to-[#4AA8D8] p-4 text-black">' +
          '<div class="text-[11px] tracking-widest opacity-70 flex items-center gap-1">' + icon('FileText', 12) + ' LINES</div>' +
          '<div class="text-[28px] font-[750] leading-none mt-2 tracking-[-0.03em]">' + s.total + '</div>' +
          '<div class="text-[11px] mt-2 opacity-70">+' + (s.total - 8) + ' simulated</div>' +
          '<div class="mt-3 h-1.5 rounded-full bg-black/15 overflow-hidden"><div class="h-full w-[92%] bg-black/40 rounded-full"></div></div>' +
        '</div>' +
        '<div class="space-y-3">' +
          '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4">' +
            '<div class="text-[11px] text-white/40">FILE SIZE</div>' +
            '<div class="text-[18px] font-semibold mt-1">' + esc(state.file.size || '2.4 MB') + '</div>' +
            '<div class="text-[10px] text-white/30 mt-1">avg 1.9kb / line</div>' +
          '</div>' +
          '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4 flex items-center justify-between">' +
            '<div>' +
              '<div class="text-[11px] text-white/40">ERROR LINES</div>' +
              '<div class="text-[18px] font-semibold mt-1 flex items-center gap-2">' + s.errors + ' <span class="w-2 h-2 rounded-full ' + (s.errors ? 'bg-[#FF9A6C]' : 'bg-[#C9F99A]') + '"></span></div>' +
            '</div>' +
            icon('TriangleAlert', 20, s.errors ? 'text-[#FF9A6C]' : 'text-white/20') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="text-[13px] font-semibold">Type distribution</h3>' +
          '<span class="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/40">LJSON</span>' +
        '</div>' +
        '<div class="space-y-3">' + rows + '</div>' +
      '</div>' +

      '<div class="rounded-[18px] bg-[#111B28] border border-white/[0.06] p-4">' +
        '<h3 class="text-[13px] font-semibold mb-3">Keys overview</h3>' +
        '<div class="flex flex-wrap gap-2">' + keyChips + '</div>' +
        '<div class="mt-4 grid grid-cols-3 gap-2 text-[11px]">' +
          '<div class="rounded-[10px] bg-white/[0.03] border border-white/5 p-2.5"><div class="text-white/30">Unique IDs</div><div class="font-mono font-medium mt-1">' + s.total + '</div></div>' +
          '<div class="rounded-[10px] bg-white/[0.03] border border-white/5 p-2.5"><div class="text-white/30">Time span</div><div class="font-mono font-medium mt-1">~4m 12s</div></div>' +
          '<div class="rounded-[10px] bg-white/[0.03] border border-white/5 p-2.5"><div class="text-white/30">Integrity</div><div class="font-mono font-medium mt-1 text-[#C9F99A]">97.2%</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="rounded-[18px] bg-[#0E1722] border border-[#66CCFF]/20 p-4 flex gap-3">' +
        '<div class="w-9 h-9 min-w-[36px] rounded-full bg-[#66CCFF]/20 flex items-center justify-center text-[#66CCFF] shrink-0">' + icon('Snowflake', 16) + '</div>' +
        '<div class="text-[12px] leading-[18px] text-white/60"><span class="text-white font-medium">Arctic note:</span> This file contains thermal drift events from buoy A12. Shift coefficient &gt; 0.5 indicates rapid ice shear. Consider exporting filtered thermal lines for further analysis.</div>' +
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

  return '' +
  '<div class="absolute bottom-0 left-0 right-0 z-20 px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2 bg-gradient-to-t from-[#0A0F18] via-[#0A0F18]/90 to-transparent">' +
    '<div class="mx-auto max-w-[390px] h-[68px] min-h-[68px] rounded-[24px] bg-[#111B28]/95 backdrop-blur-[20px] border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center justify-around px-2">' +
      items +
    '</div>' +
  '</div>';
}

const DESKTOP_NAV = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'home',       label: 'Home' },
  { id: 'viewer',     label: 'Viewer' },
  { id: 'detail',     label: 'Detail' },
  { id: 'stats',      label: 'Stats' },
];

function desktopNavHTML() {
  const pills = DESKTOP_NAV.map((item) => {
    const active = state.screen === item.id;
    return '<button data-action="nav" data-id="' + item.id + '" class="h-9 min-h-[36px] px-4 rounded-full text-[12px] font-medium capitalize transition-colors ' +
      (active ? 'bg-white text-black' : 'text-white/50 hover:text-white/80 hover:bg-white/5') + '">' + item.label + '</button>';
  }).join('');
  return '<div class="hidden lg:flex items-center justify-center gap-1 p-1 rounded-full bg-[#111B28] border border-white/10">' + pills + '</div>';
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

  document.getElementById('root').innerHTML =
  '<div class="min-h-[100dvh] w-full bg-[#05080D] lg:bg-[#070A0F] text-white selection:bg-[#66CCFF]/30 overflow-x-hidden antialiased flex flex-col lg:items-center lg:justify-center lg:min-h-screen lg:p-6" style="font-family:Geist, system-ui, -apple-system, sans-serif;padding-top:var(--safe-area-inset-top, 0px)">' +
    '<div class="hidden lg:flex flex-col items-center gap-3 mb-6 w-full max-w-[390px]">' +
      '<div class="flex items-center gap-2">' +
        '<div class="w-8 h-8 rounded-[10px] bg-[#66CCFF] text-black flex items-center justify-center">' + icon('Snowflake', 16) + '</div>' +
        '<span class="text-[12px] font-semibold tracking-[-0.01em]">ARTIC SHIFT • #66CCFF</span>' +
      '</div>' +
      desktopNavHTML() +
    '</div>' +

    '<div class="w-full flex-1 lg:flex-none lg:w-[390px] lg:h-[844px] lg:max-h-[844px] bg-[#0A0F18] relative flex flex-col overflow-hidden lg:rounded-[48px] lg:border-[10px] lg:border-[#141E2B] lg:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_90px_rgba(0,0,0,0.7)] h-[100dvh] min-h-[100dvh] lg:min-h-0">' +
      '<div class="hidden lg:flex absolute top-0 left-1/2 -translate-x-1/2 w-[96px] h-[28px] bg-[#141E2B] rounded-b-[16px] z-30 items-center justify-center gap-1.5 pointer-events-none">' +
        '<div class="w-10 h-1.5 rounded-full bg-black/50"></div>' +
        '<div class="w-2 h-2 rounded-full bg-black/30"></div>' +
      '</div>' +
      '<div class="hidden lg:block absolute -left-[13px] top-[120px] w-[3px] h-8 bg-[#141E2B] rounded-r-full"></div>' +
      '<div class="hidden lg:block absolute -left-[13px] top-[160px] w-[3px] h-14 bg-[#141E2B] rounded-r-full"></div>' +
      '<div class="hidden lg:block absolute -right-[13px] top-[140px] w-[3px] h-20 bg-[#141E2B] rounded-l-full"></div>' +

      '<div class="flex-1 relative overflow-hidden flex flex-col w-full">' +
        '<div class="h-full w-full animate-[fadeIn_0.3s_ease] flex flex-col">' + screenHTML() + '</div>' +
      '</div>' +

      (showNav ? bottomNavHTML() : '') +

      '<div class="lg:hidden absolute bottom-1 left-1/2 -translate-x-1/2 w-[120px] h-[5px] rounded-full bg-white/20 z-30 pointer-events-none"></div>' +
    '</div>' +

    '<div class="hidden lg:block mt-6 text-[11px] text-white/25 tracking-wide text-center max-w-[390px] px-4">Mobile-first • 100% responsive • 390px native feel • tap upload works on phone • icy blue #66CCFF</div>' +
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
  const scroller = document.querySelector('#root .overflow-auto');
  if (scroller) scroller.scrollTop = 0;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
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
    case 'upload':
      // Mock: the demo dataset is bundled; a real picker lands here.
      go('viewer');
      break;
    case 'select-file': {
      const f = FILES.find((x) => x.id === el.dataset.id);
      if (f) state.file = f;
      go('viewer');
      break;
    }
    case 'toggle-line': {
      const id = el.dataset.id;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      render();
      break;
    }
    case 'inspect': {
      const line = LINES.find((x) => x.id === el.dataset.id);
      if (line) { state.line = line; state.detailTab = 'tree'; state.treeToggled.clear(); }
      go('detail');
      break;
    }
    case 'copy-line': {
      const line = LINES.find((x) => x.id === el.dataset.id);
      if (line) copyText(line.raw);
      break;
    }
    case 'clear-search':
      state.search = '';
      render();
      break;
    case 'chip':
      state.search = el.dataset.v === 'All' ? '' : el.dataset.v;
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
      state.detailTab = el.dataset.v;
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
});

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'search') {
    state.search = e.target.value;
    render();
  }
});

document.addEventListener('keydown', (e) => {
  const dz = e.target.closest && e.target.closest('#dropzone');
  if (dz && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    haptic();
    go('viewer');
  }
});

// Drag & drop highlight on the home dropzone (drop itself opens the viewer).
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
    go('viewer'); // mock: real file parsing plugs in here
  }
});

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
