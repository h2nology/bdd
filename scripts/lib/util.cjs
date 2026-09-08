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
:root {
  color-scheme: light dark;
  --bg: #fbfaf8; --panel: #ffffff; --ink: #1c1b19; --muted: #6b6660;
  --line: #e3ded7; --accent: #7a5cff; --ok: #1f8a4c; --warn: #b8860b;
  --bad: #c0392b; --skip: #7c7c7c; --chip: #f1eee9;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16151a; --panel: #1e1d23; --ink: #ece9e4; --muted: #a09a92;
    --line: #33313a; --accent: #a48cff; --ok: #4ec97f; --warn: #e0b249;
    --bad: #f0736a; --skip: #8b8b8b; --chip: #2a2830;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Hiragino Sans", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px 80px; }
header.top { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 28px; }
h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
h2 { font-size: 19px; margin: 36px 0 12px; }
h3 { font-size: 16px; margin: 22px 0 8px; }
.sub { color: var(--muted); font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 20px 0 8px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.card .n { font-size: 25px; font-weight: 600; font-variant-numeric: tabular-nums; }
.card .l { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; margin: 14px 0; }
.chip { display: inline-block; background: var(--chip); border-radius: 999px; padding: 1px 9px;
  font-size: 12px; color: var(--muted); margin: 0 4px 4px 0; font-variant-numeric: tabular-nums; }
.chip.req { color: var(--accent); font-weight: 600; }
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.step { display: flex; gap: 8px; padding: 2px 0; }
.step .kw { color: var(--accent); font-weight: 600; min-width: 62px; }
.dt { margin: 6px 0 8px 70px; font-size: 13px; }
.ds { margin: 6px 0 8px 70px; padding: 8px 10px; background: var(--chip); border-radius: 6px;
  white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.pass { color: var(--ok); } .fail { color: var(--bad); }
.pending { color: var(--warn); } .skipped { color: var(--skip); }
.bar { height: 8px; border-radius: 999px; background: var(--chip); overflow: hidden; margin-top: 8px; }
.bar > i { display: block; height: 100%; background: var(--ok); }
.bar > i.low { background: var(--bad); } .bar > i.mid { background: var(--warn); }
details { margin: 6px 0; } summary { cursor: pointer; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.desc { color: var(--muted); white-space: pre-wrap; margin: 4px 0 10px; }
footer { color: var(--muted); font-size: 12px; margin-top: 40px; border-top: 1px solid var(--line); padding-top: 14px; }
@media print {
  body { background: #fff; color: #000; }
  .panel, .card { border-color: #ccc; break-inside: avoid; }
  details { display: block; } details > summary { display: none; }
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
};
