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
const src = lines.join('\n') + '\n;global.__x = { state, render, LINES, highlightJSON, treeHTML, computeStats, filteredLines, parseLine };';
(function () { eval(src); })();

const { state, render, LINES } = global.__x;
const out = {};
const cases = [
  ['onboarding', {}],
  ['onboarding_s2', { slide: 2 }],
  ['home', {}],
  ['home_drag', { dragOver: true }],
  ['viewer', {}],
  ['viewer_search', { search: 'thermal' }],
  ['viewer_empty', { search: 'zzz-no-match' }],
  ['detail', {}],
  ['detail_raw', { detailTab: 'raw' }],
  ['detail_error', {}],
  ['detail_copied', { copied: true }],
  ['stats', {}],
];
for (const [name, patch] of cases) {
  state.screen = name.split('_')[0];
  Object.assign(state, {
    slide: 0, search: '', detailTab: 'tree', dragOver: false,
    copied: false, line: LINES[0], treeToggled: new Set(),
  });
  if (name === 'detail_error') state.line = LINES.find((l) => l.error);
  Object.assign(state, patch);
  render();
  out[name] = captured.html;
}
fs.writeFileSync(path.join(__dirname, 'render_out.json'), JSON.stringify(out));
console.log('rendered:', Object.keys(out).join(','));
