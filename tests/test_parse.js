/* Unit tests for the file parser, filtering, sorting and flattening.
 * Usage: node tests/test_parse.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Minimal DOM stub so app.js can load (event listeners are no-ops here).
global.document = {
  getElementById: () => null,
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
const src = lines.join('\n') +
  '\n;global.__x = { state, parseFileContent, flattenJSON, visibleLines, allLines, computeStats, formatBytes, lineTime, detailMatches, gotoDetailMatch, markHits };';
(function () { eval(src); })();

const { state, parseFileContent, flattenJSON, visibleLines, computeStats, formatBytes, lineTime, detailMatches, gotoDetailMatch, markHits } = global.__x;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL:', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

// --- JSONL: valid lines -------------------------------------------------
let r = parseFileContent('a.jsonl', '{"id":"x1","type":"thermal"}\n{"id":"x2","type":"drift"}\n');
check('jsonl: 2 lines', r.length === 2, r.length);
check('jsonl: ids', r[0].id === 'x1' && r[1].id === 'x2');
check('jsonl: types', r[0].type === 'thermal' && r[1].type === 'drift');
check('jsonl: no errors', r.every((l) => !l.error));
check('jsonl: raw preserved', r[0].raw === '{"id":"x1","type":"thermal"}');
check('jsonl: line numbers', r[0].n === 1 && r[1].n === 2);
check('jsonl: uids unique', r[0].uid !== r[1].uid);

// --- blank lines skipped ------------------------------------------------
r = parseFileContent('a.jsonl', '\n{"a":1}\n\n\r\n{"a":2}\n');
check('blank lines skipped', r.length === 2, r.length);

// --- malformed lines become error records --------------------------------
r = parseFileContent('a.jsonl', '{"ok":1}\n{"broken":\n{"ok":2}');
check('malformed: 3 records', r.length === 3, r.length);
check('malformed: error flagged', !!r[1].error && r[1].type === 'error');
check('malformed: error mentions line', /Line 2/.test(r[1].error), r[1].error);
check('malformed: good lines intact', !r[0].error && !r[2].error);
check('malformed: raw kept', r[1].raw === '{"broken":');

// --- .json: top-level array ----------------------------------------------
r = parseFileContent('a.json', '[{"id":"a"},{"id":"b"}]');
check('json array: 2 lines', r.length === 2, r.length);
check('json array: ids', r[0].id === 'a' && r[1].id === 'b');

// --- .json: single object -------------------------------------------------
r = parseFileContent('a.json', '{"id":"solo","type":"x"}');
check('json object: 1 line', r.length === 1, r.length);
check('json object: id', r[0].id === 'solo');

// --- .json: invalid --------------------------------------------------------
r = parseFileContent('a.json', '{"broken":');
check('json invalid: 1 error record', r.length === 1 && !!r[0].error, r.length);

// --- .ljson / .ljsone treated as line-delimited -----------------------------
r = parseFileContent('a.ljsone', '{"k":1}\n{"k":2}');
check('ljsone: 2 lines', r.length === 2, r.length);
r = parseFileContent('a.ljson', '{"k":1}');
check('ljson: 1 line', r.length === 1, r.length);

// --- empty file -------------------------------------------------------------
r = parseFileContent('a.jsonl', '   \n  ');
check('empty: 0 lines', r.length === 0, r.length);

// --- field derivation -------------------------------------------------------
r = parseFileContent('a.jsonl', '{"_id":"z9","ts":"2024-01-02T03:04:05Z","kind":"ping"}');
check('derive _id', r[0].id === 'z9', r[0].id);
check('derive ts', r[0].timestamp === '2024-01-02T03:04:05Z', r[0].timestamp);
check('derive kind', r[0].type === 'ping', r[0].type);
r = parseFileContent('a.jsonl', '{"a":1}');
check('defaults: id', r[0].id === 'line_001', r[0].id);
check('defaults: type', r[0].type === 'record', r[0].type);
check('defaults: timestamp', r[0].timestamp === '');

// --- big-ish input (50k lines) ----------------------------------------------
const big = Array.from({ length: 50000 }, (_, i) => '{"id":"l' + i + '","type":"t' + (i % 5) + '"}').join('\n');
const t0 = Date.now();
r = parseFileContent('big.jsonl', big);
const ms = Date.now() - t0;
check('50k lines parsed', r.length === 50000, r.length);
console.log('  (50k lines parsed in ' + ms + 'ms)');

// --- flattenJSON --------------------------------------------------------------
let rows = flattenJSON({ a: 1, b: { c: 'x', d: [1, 2] }, e: null }, '', []);
check('flatten: paths', rows.some(([p]) => p === 'a') && rows.some(([p]) => p === 'b.c') &&
  rows.some(([p]) => p === 'b.d.0') && rows.some(([p]) => p === 'b.d.1'), rows.map(([p]) => p));
check('flatten: values', rows.find(([p]) => p === 'a')[1] === 1 &&
  rows.find(([p]) => p === 'b.c')[1] === 'x' && rows.find(([p]) => p === 'e')[1] === null);
rows = flattenJSON([1, 2], '', []);
check('flatten: root array', rows.length === 2 && rows[0][0] === '0', rows);

// --- visibleLines: search / filter / sort ---------------------------------------
state.doc = {
  name: 't.jsonl', sizeBytes: 10, parsedMs: 1,
  lines: parseFileContent('t.jsonl', [
    '{"id":"b","timestamp":"2024-01-03T00:00:00Z","type":"zeta"}',
    '{"id":"a","timestamp":"2024-01-01T00:00:00Z","type":"alpha"}',
    '{"id":"c","type":"alpha"}',
    'nope{',
  ].join('\n')),
};
const reset = () => Object.assign(state, { search: '', typeFilter: 'All', errorsOnly: false, sort: 'line' });
reset();
check('visible: all', visibleLines().length === 4);
reset(); state.search = 'alpha';
check('visible: search', visibleLines().length === 2, visibleLines().length);
reset(); state.typeFilter = 'alpha';
check('visible: type filter', visibleLines().length === 2 && visibleLines().every((l) => l.type === 'alpha'));
reset(); state.errorsOnly = true;
check('visible: errors only', visibleLines().length === 1 && visibleLines()[0].error, visibleLines().length);
reset(); state.sort = 'timeAsc';
check('visible: timeAsc', visibleLines().map((l) => l.id).join(',') === 'a,b,c,line_004', visibleLines().map((l) => l.id));
reset(); state.sort = 'timeDesc';
check('visible: timeDesc', visibleLines()[0].id === 'b', visibleLines().map((l) => l.id));
reset(); state.sort = 'type';
check('visible: type sort', visibleLines().map((l) => l.type).join(',') === 'alpha,alpha,error,zeta', visibleLines().map((l) => l.type));

// --- computeStats ----------------------------------------------------------------
reset();
const s = computeStats();
check('stats: total', s.total === 4, s.total);
check('stats: errors', s.errors === 1, s.errors);
check('stats: types', s.types.alpha === 2 && s.types.zeta === 1, s.types);
check('stats: keys', s.keys.includes('id') && s.keys.includes('timestamp'), s.keys);
check('stats: integrity', s.integrity === 75, s.integrity);
check('stats: span', s.span === '2d', s.span);

// --- formatBytes -------------------------------------------------------------------
check('formatBytes B', formatBytes(512) === '512 B');
check('formatBytes KB', formatBytes(2048) === '2.0 KB');
check('formatBytes MB', formatBytes(5 * 1024 * 1024) === '5.0 MB');

// --- lineTime ------------------------------------------------------------------------
check('lineTime valid', !isNaN(lineTime({ timestamp: '2024-01-01T00:00:00Z' })));
check('lineTime empty', isNaN(lineTime({ timestamp: '' })));
check('lineTime garbage', isNaN(lineTime({ timestamp: 'not-a-date' })));

// --- detail search: file-wide match navigation ---------------------------------------
state.doc = {
  name: 't.jsonl', sizeBytes: 0,
  lines: parseFileContent('t.jsonl', '{"id":"a","x":"hello"}\n{"id":"b","x":"world"}\n{"id":"c","x":"HELLO again"}\n'),
  parsedMs: 1,
};
state.line = state.doc.lines[0];
state.detailSearch = 'hello';
state.detailMatch = 0;
let dm = detailMatches();
check('dsearch: 2 matches, case-insensitive', dm.length === 2 && dm[0].id === 'a' && dm[1].id === 'c', dm.length);
check('dsearch: next wraps to first', gotoDetailMatch(2) && state.line.id === 'a' && state.detailMatch === 0, state.detailMatch);
check('dsearch: prev wraps to last', gotoDetailMatch(-1) && state.line.id === 'c' && state.detailMatch === 1, state.detailMatch);
check('dsearch: tree toggles cleared on jump', state.treeToggled.size === 0);
state.detailSearch = 'zzz';
check('dsearch: no matches -> false, line kept', gotoDetailMatch(0) === false && state.line.id === 'c');
state.detailSearch = '   ';
check('dsearch: blank query -> no matches', detailMatches().length === 0);
check('markHits: wraps hit', markHits('a&amp;b hello', 'hello') === 'a&amp;b <mark>hello</mark>', markHits('a&amp;b hello', 'hello'));
check('markHits: case-insensitive', markHits('HELLO x', 'hello') === '<mark>HELLO</mark> x');
check('markHits: query with markup is escaped safely', markHits('&lt;hi&gt;', '<hi>') === '<mark>&lt;hi&gt;</mark>');
check('markHits: multiple hits', markHits('aa aa', 'aa') === '<mark>aa</mark> <mark>aa</mark>');
check('markHits: empty query passthrough', markHits('abc', '') === 'abc');
state.doc = null; state.line = null; state.detailSearch = ''; state.detailMatch = 0;

console.log(`parse tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
