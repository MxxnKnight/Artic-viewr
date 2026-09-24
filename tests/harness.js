/* Test harness: renders every screen/state of the app in Node with a DOM stub.
 * Usage: node tests/harness.js  -> writes tests/render_out.json
 * Not shipped to the site; used for class-coverage and parity checks. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let captured = {};
const rootStub = {};
Object.defineProperty(rootStub, 'innerHTML', {
  set(v) { captured.html = v; },
  get() { return captured.html; },
});
global.document = {
  getElementById: (id) => (id === 'root' ? rootStub : null),
  addEventListener: () => {},
  activeElement: null,
  createElement: () => ({ style: {}, select() {} }),
  body: { appendChild() {}, removeChild() {} },
  querySelector: () => null,
};
global.navigator = {};

let lines = (
  fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')
).split('\n');
lines = lines.filter((l) => l.trim() !== "'use strict';");
while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
if (lines[lines.length - 1].trim() === 'render();') lines.pop();
const src = lines.join('\n') + '\n;global.__x = { state, render, highlightJSON, treeHTML, computeStats, visibleLines, parseLine, parseFileContent, flattenJSON, makeLine, allLines, tableHTML };';
(function () { eval(src); })();

const { state, render, parseFileContent } = global.__x;

// Sample user file (mix of good lines, a malformed line, and odd shapes).
const SAMPLE = [
  '{"id":"shift_001","timestamp":"2024-03-12T08:12:33Z","type":"thermal","data":{"lat":71.294,"lon":-156.789,"temp":-32.4}}',
  '{"id":"shift_002","timestamp":"2024-03-12T08:13:01Z","type":"drift","data":{"velocity":0.04}}',
  '{"id":"shift_003","timestamp":"2024-03-12T08:13:45Z","type":"pressure","hPa":1012.3}',
  '{"id":"shift_004","timestamp":"2024-03-12T08:14:12Z","type":',
  '',
  '{"id":"shift_005","type":"ice_core","depth":12.4}',
  '[1,2,3]',
].join('\n');

function makeDoc() {
  const parsed = parseFileContent('sample.jsonl', SAMPLE);
  return { name: 'sample.jsonl', sizeBytes: SAMPLE.length, lines: parsed, parsedMs: 3 };
}

const out = {};
const cases = [
  ['onboarding', {}],
  ['onboarding_s2', { slide: 2 }],
  ['home', {}],
  ['home_file', {}, true],
  ['home_drag', { dragOver: true }, true],
  ['home_error', { fileError: '"big.jsonl" is 72.0 MB -- files are capped at 50MB.' }],
  ['viewer_nofile', {}],
  ['viewer', {}, true],
  ['viewer_search', { search: 'thermal' }, true],
  ['viewer_errors', { errorsOnly: true }, true],
  ['viewer_sort', { sort: 'timeDesc', sortOpen: true }, true],
  ['viewer_nomatch', { search: 'zzz-no-match' }, true],
  ['viewer_window', { big: true }, true],
  ['detail', {}, true],
  ['detail_table', { detailTab: 'table' }, true],
  ['detail_raw', { detailTab: 'raw' }, true],
  ['detail_error', {}, true],
  ['detail_copied', { copied: true }, true],
  ['stats', {}, true],
  ['stats_nofile', {}],
];

const base = {
  slide: 0, search: '', typeFilter: 'All', errorsOnly: false, sort: 'line',
  sortOpen: false, detailTab: 'tree', dragOver: false, copied: false,
  treeToggled: new Set(), expanded: new Set(), fileError: '', parsing: null,
  line: null, doc: null,
};

for (const [name, patch, withDoc] of cases) {
  state.screen = name === 'onboarding' || name === 'onboarding_s2' ? 'onboarding'
    : name.startsWith('home') ? 'home'
    : name.startsWith('viewer') ? 'viewer'
    : name.startsWith('detail') ? 'detail'
    : 'stats';
  Object.assign(state, base);
  if (withDoc) {
    state.doc = makeDoc();
    if (patch.big) {
      const many = Array.from({ length: 500 }, (_, i) =>
        '{"id":"row_' + i + '","timestamp":"2024-03-12T08:12:33Z","type":"t' + (i % 3) + '","v":' + i + '}');
      state.doc = {
        name: 'big.jsonl', sizeBytes: many.join('\n').length,
        lines: parseFileContent('big.jsonl', many.join('\n')), parsedMs: 9,
      };
    }
    state.line = state.doc.lines[0];
  }
  if (name === 'detail_error') state.line = state.doc.lines.find((l) => l.error);
  Object.assign(state, patch);
  render();
  out[name] = captured.html;
}
fs.writeFileSync(path.join(__dirname, 'render_out.json'), JSON.stringify(out));
console.log('rendered:', Object.keys(out).join(','));
