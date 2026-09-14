'use strict';
/** Shared helpers for the bdd plugin scripts. Zero dependencies. */

const fs = require('fs');
const path = require('path');
const gherkin = require('./gherkin.cjs');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  'bin', 'obj', '.venv', 'venv', '__pycache__', '.gradle', '.idea', '.next',
  'coverage', '.pytest_cache', 'bdd-artifacts',
]);

/** Minimal `--key value` / `--flag` parser. Repeated keys collect into an array. */
function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      let key;
      let value;
      if (eq !== -1) { key = arg.slice(2, eq); value = arg.slice(eq + 1); }
      else {
        key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) { value = next; i += 1; }
        else value = true;
      }
      const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (opts[camel] === undefined) opts[camel] = value;
      else if (Array.isArray(opts[camel])) opts[camel].push(value);
      else opts[camel] = [opts[camel], value];
    } else positional.push(arg);
  }
  opts._ = positional;
  return opts;
}

function asList(value) {
  if (value === undefined || value === null || value === true) return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

function walk(dir, out, ext) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      if (entry.isDirectory()) continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out, ext);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve CLI paths (files or directories) into a sorted list of .feature files. */
function findFeatureFiles(inputs) {
  const roots = inputs.length ? inputs : ['features', 'src/test/resources/features', 'Features', 'tests/features', '.'];
  const files = [];
  for (const input of roots) {
    if (!fs.existsSync(input)) continue;
    const stat = fs.statSync(input);
    if (stat.isDirectory()) walk(input, files, '.feature');
    else if (input.toLowerCase().endsWith('.feature')) files.push(input);
  }
  return Array.from(new Set(files)).sort();
}

function loadFeatures(inputs) {
  const files = findFeatureFiles(inputs);
  return files.map((file) => {
    const uri = path.relative(process.cwd(), file).split(path.sep).join('/');
    return gherkin.parseFeature(fs.readFileSync(file, 'utf8'), uri);
  });
}

const REQ_TAG = /^@(REQ|REQUIREMENT|US|STORY|JIRA|ISSUE|TICKET|AC)[-_:]?(.+)$/i;

/**
 * Pull requirement ids out of tags. Extra prefixes may be supplied
 * (e.g. --req-prefix PROJ makes "@PROJ-12" a requirement id).
 */
function extractRequirements(tags, extraPrefixes) {
  const ids = [];
  for (const tag of tags || []) {
    const m = REQ_TAG.exec(tag);
    if (m) { ids.push(tag.slice(1)); continue; }
    for (const prefix of extraPrefixes || []) {
      const re = new RegExp('^@' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[-_:]?.+$', 'i');
      if (re.test(tag)) { ids.push(tag.slice(1)); break; }
    }
  }
  return Array.from(new Set(ids));
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿぀-ヿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'x';
}

/** Label an outline example row so identical scenario names stay distinguishable. */
function exampleLabel(instance) {
  if (!instance.exampleRow) return instance.name;
  const pairs = Object.entries(instance.exampleRow).map(([k, v]) => `${k}=${v}`).join(', ');
  return /</.test(instance.name) ? instance.name : `${instance.name} [${pairs}]`;
}

const BASE_CSS = `
/* A specification is read, not admired: neutral slate for the page, one blue
   reserved for the things that carry meaning (keywords, requirement ids). */
:root {
  color-scheme: light dark;
  --bg: #f8fafc; --panel: #ffffff; --ink: #1e293b; --muted: #64748b;
  --line: #e2e8f0; --line-soft: #eef2f7; --chip: #f1f5f9;
  --accent: #2563eb; --accent-soft: #eff6ff;
  --ok: #15803d; --warn: #a16207; --bad: #dc2626; --skip: #64748b;
  --fs-xs: 12px; --fs-sm: 13px; --fs-base: 14px; --fs-md: 15px;
  --fs-lg: 18px; --fs-xl: 23px; --fs-2xl: 29px;
  --sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    "Noto Sans", "Hiragino Sans", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", "Noto Sans Mono", "Hiragino Sans", "Microsoft YaHei", monospace;
  --radius: 8px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a; --panel: #1a2436; --ink: #e2e8f0; --muted: #94a3b8;
    --line: #334155; --line-soft: #26334a; --chip: #243044;
    --accent: #60a5fa; --accent-soft: #172554;
    --ok: #4ade80; --warn: #fbbf24; --bad: #f87171; --skip: #94a3b8;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: var(--fs-md)/1.6 var(--sans);
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1120px; margin: 0 auto; padding: 40px 24px 96px; }

header.top { border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 24px; }
h1 { font-size: var(--fs-2xl); margin: 0 0 4px; letter-spacing: -0.02em; font-weight: 650; }
h2 {
  font-size: var(--fs-lg); margin: 40px 0 12px; font-weight: 600;
  letter-spacing: -0.01em; padding-bottom: 6px; border-bottom: 1px solid var(--line);
}
h3 { font-size: var(--fs-md); margin: 24px 0 6px; font-weight: 600; }
h4 { font-size: var(--fs-xs); margin: 12px 0 4px; font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: .06em; }

/* Three levels live in this document - feature, rule, scenario. Without a visible
   hierarchy they read as one flat list and the reviewer loses their place. */
h3.feat {
  font-size: var(--fs-lg); font-weight: 650; letter-spacing: -0.01em;
  margin: 44px 0 4px; padding-left: 12px; border-left: 3px solid var(--accent);
}
h3.feat + .sub { padding-left: 15px; }
h3.rule {
  font-size: var(--fs-base); font-weight: 600; color: var(--muted);
  margin: 26px 0 8px; padding-left: 12px; border-left: 3px solid var(--line);
}
h3.scen { font-size: var(--fs-base); margin: 0 0 2px; }
.kind {
  display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 4px;
  background: var(--chip); color: var(--muted); font-size: var(--fs-xs);
  font-weight: 400; letter-spacing: 0; vertical-align: 2px;
}
.bgpanel { background: none; border-style: dashed; }
.ex { margin-left: 66px; }
.ex table { width: auto; min-width: 40%; }
.ex th, .ex td { padding: 4px 14px 4px 0; font-family: var(--mono); font-size: var(--fs-sm); }
.ex th { text-transform: none; letter-spacing: 0; }
.sub { color: var(--muted); font-size: var(--fs-sm); font-weight: 400; }
.desc { color: var(--muted); white-space: pre-wrap; margin: 6px 0 12px; max-width: 72ch; }

/* Stat cards: the number is the content, the label is the caption. */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 10px; margin: 20px 0 10px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; }
.card .n { font-size: var(--fs-xl); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.2; }
.card .l { color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .07em; margin-top: 2px; }

.panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; margin: 8px 0; }
.panel > ul { margin: 0; padding-left: 20px; }
.panel > ul > li { margin: 3px 0; }
.panel.sub { color: var(--muted); font-size: var(--fs-sm); }

.chip {
  display: inline-block; background: var(--chip); border-radius: 5px; padding: 2px 8px;
  font-size: var(--fs-xs); color: var(--muted); margin: 0 4px 4px 0;
  font-family: var(--mono); font-variant-numeric: tabular-nums;
}
.chip.req { background: var(--accent-soft); color: var(--accent); font-weight: 600; }

/* Dense tables: this is where most of the report lives. */
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: var(--fs-base); }
th, td { text-align: left; padding: 7px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
th {
  position: sticky; top: 0; z-index: 1; background: var(--panel);
  color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase;
  letter-spacing: .06em; font-weight: 600; border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
tbody tr:last-child td { border-bottom: none; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

/* Gherkin renders in mono: steps align, data tables line up, values stay scannable. */
.step {
  display: grid; grid-template-columns: minmax(56px, max-content) 1fr; gap: 0 10px;
  padding: 2px 0; font-family: var(--mono); font-size: var(--fs-sm); line-height: 1.55;
}
.step .kw { color: var(--accent); font-weight: 600; }
.dt { margin: 6px 0 8px 66px; font-size: var(--fs-sm); }
.dt table { font-size: var(--fs-sm); font-family: var(--mono); }
.dt th, .dt td { padding: 4px 10px; text-transform: none; letter-spacing: 0; }
.ds {
  margin: 6px 0 8px 66px; padding: 10px 12px; background: var(--chip);
  border-left: 2px solid var(--line); border-radius: 0 4px 4px 0;
  white-space: pre-wrap; font-family: var(--mono); font-size: var(--fs-sm); color: var(--muted);
}

/* Status carries a glyph as well as a colour - colour alone fails WCAG 1.4.1. */
.pass, .fail, .pending, .skipped { white-space: nowrap; }
.pass::before, .fail::before, .pending::before, .skipped::before { margin-right: 5px; font-weight: 600; }
.pass { color: var(--ok); } .pass::before { content: "✓"; }
.fail { color: var(--bad); font-weight: 600; } .fail::before { content: "✗"; }
.pending { color: var(--warn); } .pending::before { content: "○"; }
.skipped { color: var(--skip); } .skipped::before { content: "–"; }

.bar { height: 6px; border-radius: 999px; background: var(--chip); overflow: hidden; margin-top: 10px; }
.bar > i { display: block; height: 100%; background: var(--ok); }
.bar > i.low { background: var(--bad); } .bar > i.mid { background: var(--warn); }

details { margin: 6px 0; }
summary { cursor: pointer; color: var(--accent); }
summary:hover { text-decoration: underline; }
code { font-family: var(--mono); font-size: 0.92em; background: var(--chip); padding: 1px 5px; border-radius: 4px; }
a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }

footer { color: var(--muted); font-size: var(--fs-xs); margin-top: 56px; border-top: 1px solid var(--line); padding-top: 16px; }

@media (max-width: 640px) {
  .wrap { padding: 24px 14px 64px; }
  h1 { font-size: var(--fs-xl); }
  .dt, .ds { margin-left: 0; }
  .step { grid-template-columns: 1fr; }
  .step .kw { margin-top: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}

/* Print is a first-class target: this report exists to be signed off on paper.
   Forced light, repeated table headers, and no rows split across a page break. */
@media print {
  :root {
    --bg: #fff; --panel: #fff; --ink: #000; --muted: #444;
    --line: #bbb; --line-soft: #ddd; --chip: #f4f4f4;
    --accent: #1a4fb4; --accent-soft: #eef3fd;
  }
  @page { margin: 14mm 12mm; }
  body { font-size: 11pt; }
  .wrap { max-width: none; padding: 0; }
  thead { display: table-header-group; }
  tr, .panel, .card, .step { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
  th { position: static; }
  details { display: block; } details > summary { display: none; }
  footer { margin-top: 24px; }
}
`;

function htmlPage(title, bodyHtml, extraCss) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}${extraCss || ''}</style>
</head><body><div class="wrap">${bodyHtml}</div></body></html>`;
}

function statCard(label, value, extra) {
  return `<div class="card"><div class="n">${escapeHtml(value)}</div><div class="l">${escapeHtml(label)}</div>${extra || ''}</div>`;
}

function progressBar(pct) {
  const cls = pct >= 80 ? '' : pct >= 50 ? 'mid' : 'low';
  return `<div class="bar"><i class="${cls}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
}

function renderTable(rows, opts) {
  if (!rows || !rows.length) return '';
  const [head, ...body] = rows;
  const cell = (c) => escapeHtml(c);
  const headHtml = head.cells.map((c) => `<th>${cell(c)}</th>`).join('');
  const bodyHtml = body.map((r) => `<tr>${r.cells.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="tablewrap"><table class="${(opts && opts.className) || ''}"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function writeFileEnsured(target, content) {
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  fs.writeFileSync(target, content);
  return path.resolve(target);
}

function readJsonMaybe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** Opening or closing fence of a code block: ``` or ~~~, indented up to 3 spaces. */
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*\S*\s*$/;

/**
 * One boolean per line, true where that line is inside a fenced code block -
 * the fence markers themselves included.
 *
 * Both plan scripts read a plan line by line, looking for `#### Phase n`
 * headings, `- [ ]` boxes and `**Status:**` lines. A plan that *shows* one of
 * those rather than declaring it - the BDD template's Phase 4 block, quoted so
 * Phase 3 can copy it once per capability - would otherwise have its example
 * read as the real thing: `planning-status.cjs` reports a phase nobody wrote,
 * with unticked boxes nobody can tick, and `phase-status.cjs` can write a
 * status line into the middle of the example.
 *
 * An unclosed fence swallows the rest of the document, which is what a markdown
 * renderer does with it too.
 */
function fencedLines(lines) {
  const inside = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    const fence = lines[i].match(FENCE_RE);
    if (!open) {
      if (fence) { open = { char: fence[1][0], len: fence[1].length }; inside[i] = true; }
      continue;
    }
    inside[i] = true;
    // A fence closes on the same character, repeated at least as many times.
    if (fence && fence[1][0] === open.char && fence[1].length >= open.len) open = null;
  }
  return inside;
}

/**
 * The document with every fenced line blanked out.
 *
 * Blanked rather than removed so line numbers still match the file on disk -
 * anything reporting a position stays honest.
 */
function stripFences(md) {
  const lines = md.split(/\r?\n/);
  const inside = fencedLines(lines);
  return lines.map((line, i) => (inside[i] ? '' : line)).join('\n');
}

/** Read a file that is either a JSON array/object or newline-delimited JSON. */
function readJsonOrNdjson(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  if (text.startsWith('[') || (text.startsWith('{') && !text.includes('}\n{'))) {
    try { const v = JSON.parse(text); return Array.isArray(v) ? v : [v]; } catch { /* fall through */ }
  }
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* ignore malformed line */ }
  }
  return out;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function nowStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

module.exports = {
  parseArgs, asList, findFeatureFiles, loadFeatures, extractRequirements, REQ_TAG,
  escapeHtml, slug, exampleLabel, htmlPage, statCard, progressBar, renderTable,
  writeFileEnsured, readJsonMaybe, readJsonOrNdjson, pct, nowStamp, BASE_CSS, SKIP_DIRS,
  fencedLines, stripFences,
};
