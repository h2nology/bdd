#!/usr/bin/env node
'use strict';
/**
 * Playwright step captures -> page flow map (Mermaid + HTML gallery).
 *
 * Reads the capture records written by the AfterStep hooks installed by the
 * bdd-setup skill (see skills/flow-map/references/capture-contract.md).
 *
 * Two lanes feed it:
 *   web    - Playwright captures carry `url`; page identity comes from the path
 *   mobile - Appium captures carry `screen` (Android activity / iOS view
 *            controller); screen identity comes from that name
 *
 * Usage:
 *   node flow-map.cjs [--input <dir|file>]... [options]
 *
 * Options:
 *   --input <path>     Capture dir or ndjson/json file (default bdd-artifacts/flow)
 *   --out <file>       Output HTML (default bdd-artifacts/flow-map.html)
 *   --mermaid <file>   Also write the Mermaid source (default: --out with .mmd suffix)
 *   --json <file>      Also write the structured model as JSON
 *   --labels <tag>     Report chrome language: en | zh-CN | zh-TW | ja
 *   --keep-query       Treat differing query strings as different pages
 *   --keep-ids         Do not collapse /orders/1234 and /orders/9999 into /orders/:id
 *   --split-origin     Prefix page labels with the host (multi-origin flows)
 *   --full-screens     Keep package-qualified native screen names as captured
 *   --max-label <n>    Max characters of a step text used as an edge label (default 42)
 */

const fs = require('fs');
const path = require('path');
const u = require('./lib/util.cjs');
const { labelsFor } = require('./lib/labels.cjs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function collectRecords(inputs) {
  const roots = inputs.length ? inputs : [path.join('bdd-artifacts', 'flow')];
  const files = [];
  for (const input of roots) {
    if (!fs.existsSync(input)) continue;
    if (fs.statSync(input).isDirectory()) {
      const stack = [input];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (/\.(ndjson|jsonl|json)$/i.test(entry.name)) files.push(full);
        }
      }
    } else files.push(input);
  }
  const records = [];
  for (const file of files.sort()) {
    for (const rec of u.readJsonOrNdjson(file)) {
      if (rec && typeof rec === 'object' && (rec.url || rec.screen || rec.screenshot)) {
        records.push(Object.assign({ _file: file }, rec));
      }
    }
  }
  return { records, files };
}

/**
 * Collapse a native screen name into a stable identity.
 * Appium reports Android activities as `com.example.app/.CheckoutActivity` and
 * iOS screens as whatever the app exposes; the package prefix is noise in a
 * diagram, so it is dropped unless --full-screens is given.
 */
function normalizeScreen(screen, opts) {
  const raw = String(screen).trim();
  if (opts.fullScreens) return { key: raw, host: null, pathKey: raw, native: true };
  const afterSlash = raw.slice(raw.lastIndexOf('/') + 1);
  const afterDot = afterSlash.slice(afterSlash.lastIndexOf('.') + 1);
  const name = (afterDot || afterSlash || raw).trim() || 'unknown';
  return { key: name, host: null, pathKey: name, native: true };
}

/**
 * Collapse one capture into a stable page identity.
 * Web: `/orders/1234` -> `/orders/:id`. Native: the screen name.
 * Accepts a whole record, or a bare URL string for direct callers.
 */
function normalizePage(record, opts) {
  const rec = typeof record === 'string' || record == null ? { url: record } : record;
  const rawUrl = rec.url;
  if (!rawUrl && rec.screen) return normalizeScreen(rec.screen, opts);

  const fallback = { key: String(rawUrl || 'unknown'), host: null, pathKey: String(rawUrl || 'unknown'), native: false };
  if (!rawUrl) return fallback;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return fallback; }

  const collapse = (segment) => {
    if (opts.keepIds) return segment;
    if (/^\d+$/.test(segment)) return ':id';
    if (UUID_RE.test(segment)) return ':uuid';
    if (/^[0-9a-f]{12,}$/i.test(segment)) return ':hash';
    return segment;
  };

  const segments = parsed.pathname.split('/').filter(Boolean).map(collapse);
  let pathKey = '/' + segments.join('/');
  if (parsed.hash && parsed.hash.length > 1) {
    const hashSegments = parsed.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(collapse);
    if (hashSegments.length) pathKey += '#/' + hashSegments.join('/');
  }
  if (opts.keepQuery && parsed.search) pathKey += parsed.search;
  const key = opts.splitOrigin ? parsed.host + pathKey : pathKey;
  return { key: key || '/', host: parsed.host, pathKey: pathKey || '/', native: false };
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '...' : t;
}

/** Mermaid node/edge labels cannot carry quotes or bracket characters. */
function mermaidLabel(text) {
  return String(text).replace(/"/g, "'").replace(/[[\]{}()<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function build(records, opts) {
  const L = labelsFor(opts.labels);
  const maxLabel = parseInt(opts.maxLabel, 10) || 42;

  const scenarios = new Map();
  for (const rec of records) {
    const key = (rec.scenarioUri || '') + ':' + (rec.scenarioLine || '') + ':' + (rec.scenario || '');
    if (!scenarios.has(key)) {
      scenarios.set(key, {
        key, name: rec.scenario || '(unnamed scenario)', uri: rec.scenarioUri || null,
        line: rec.scenarioLine || null, tags: rec.tags || [], device: rec.device || null,
        platform: rec.platform || null, driver: rec.driver || null,
        status: 'passed', steps: [],
      });
    }
    const sc = scenarios.get(key);
    sc.steps.push(rec);
    if (rec.status === 'failed') sc.status = 'failed';
    else if (rec.status === 'undefined' && sc.status !== 'failed') sc.status = 'undefined';
    if (!sc.device && rec.device) sc.device = rec.device;
    if (!sc.platform && rec.platform) sc.platform = rec.platform;
    if (!sc.driver && rec.driver) sc.driver = rec.driver;
    if (rec.tags && rec.tags.length && !sc.tags.length) sc.tags = rec.tags;
  }

  const order = (a, b) => {
    const ai = a.stepIndex === undefined ? null : Number(a.stepIndex);
    const bi = b.stepIndex === undefined ? null : Number(b.stepIndex);
    if (ai !== null && bi !== null && ai !== bi) return ai - bi;
    return (Date.parse(a.timestamp || '') || 0) - (Date.parse(b.timestamp || '') || 0);
  };

  const pages = new Map();
  const edges = new Map();

  for (const sc of scenarios.values()) {
    sc.steps.sort(order);
    sc.path = [];
    let prevKey = null;
    sc.steps.forEach((rec, i) => {
      const page = normalizePage(rec, opts);
      if (!pages.has(page.key)) {
        pages.set(page.key, {
          key: page.key, pathKey: page.pathKey, hosts: new Set(), titles: new Map(),
          visits: 0, entries: 0, scenarios: new Set(), screenshots: [], native: page.native,
        });
      }
      const node = pages.get(page.key);
      node.visits += 1;
      node.native = node.native || page.native;
      if (page.host) node.hosts.add(page.host);
      if (rec.title) node.titles.set(rec.title, (node.titles.get(rec.title) || 0) + 1);
      node.scenarios.add(sc.name);
      const stepText = ((rec.keyword || '') + ' ' + (rec.step || '')).trim();
      if (rec.screenshot && node.screenshots.length < 12) {
        node.screenshots.push({ file: rec.screenshot, step: stepText, scenario: sc.name, url: rec.url });
      }
      if (i === 0) node.entries += 1;

      if (prevKey !== null && prevKey !== page.key) {
        const edgeKey = prevKey + ' >> ' + page.key;
        if (!edges.has(edgeKey)) {
          edges.set(edgeKey, { from: prevKey, to: page.key, count: 0, triggers: new Map(), scenarios: new Set(), statuses: new Set() });
        }
        const edge = edges.get(edgeKey);
        edge.count += 1;
        const trigger = stepText || '(navigation)';
        edge.triggers.set(trigger, (edge.triggers.get(trigger) || 0) + 1);
        edge.scenarios.add(sc.name);
        edge.statuses.add(rec.status || 'unknown');
      }
      if (prevKey !== page.key) sc.path.push({ page: page.key, step: stepText, status: rec.status || null });
      prevKey = page.key;
    });
  }

  const pageList = Array.from(pages.values()).map((p) => {
    const title = Array.from(p.titles.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      key: p.key, pathKey: p.pathKey, label: title ? title[0] : p.pathKey,
      native: Boolean(p.native), hosts: Array.from(p.hosts), visits: p.visits, entries: p.entries,
      scenarios: Array.from(p.scenarios), screenshots: p.screenshots,
    };
  }).sort((a, b) => b.entries - a.entries || b.visits - a.visits || a.key.localeCompare(b.key));

  const ids = new Map();
  pageList.forEach((p, i) => ids.set(p.key, 'p' + i));

  const edgeList = Array.from(edges.values()).map((e) => ({
    from: e.from, to: e.to, count: e.count,
    trigger: Array.from(e.triggers.entries()).sort((a, b) => b[1] - a[1])[0][0],
    triggers: Array.from(e.triggers.keys()),
    scenarios: Array.from(e.scenarios),
    failed: e.statuses.has('failed'),
  })).sort((a, b) => b.count - a.count);

  const mermaid = ['graph LR'];
  for (const p of pageList) {
    const label = mermaidLabel(p.label);
    const detail = mermaidLabel(p.pathKey);
    const text = detail && detail !== label ? label + '<br/>' + detail : label;
    mermaid.push('  ' + ids.get(p.key) + '["' + text + '"]');
  }
  for (const e of edgeList) {
    const arrow = e.failed ? '-.->' : '-->';
    const label = mermaidLabel(truncate(e.trigger, maxLabel)) + (e.count > 1 ? ' (' + e.count + ')' : '');
    mermaid.push('  ' + ids.get(e.from) + ' ' + arrow + '|"' + label + '"| ' + ids.get(e.to));
  }
  for (const p of pageList) if (p.entries) mermaid.push('  style ' + ids.get(p.key) + ' stroke-width:3px');
  const mermaidSrc = mermaid.join('\n');

  const nativeOnly = pageList.length > 0 && pageList.every((p) => p.native);
  const pageWord = nativeOnly ? L.screens : L.pages;

  const model = {
    generatedAt: u.nowStamp(),
    stats: {
      scenarios: scenarios.size, pages: pageList.length, native: nativeOnly,
      transitions: edgeList.length,
      captures: records.length, screenshots: records.filter((r) => r.screenshot).length,
      failedScenarios: Array.from(scenarios.values()).filter((s) => s.status === 'failed').length,
    },
    pages: pageList.map((p) => Object.assign({ id: ids.get(p.key) }, p)),
    transitions: edgeList.map((e) => Object.assign({}, e, { fromId: ids.get(e.from), toId: ids.get(e.to) })),
    scenarios: Array.from(scenarios.values()).map((s) => ({
      name: s.name, uri: s.uri, line: s.line, tags: s.tags, device: s.device,
      platform: s.platform, driver: s.driver, status: s.status, path: s.path,
    })),
    mermaid: mermaidSrc,
  };

  const outTarget = typeof opts.out === 'string' ? opts.out : path.join('bdd-artifacts', 'flow-map.html');
  const outDir = path.dirname(path.resolve(outTarget));
  const relShot = (file) => {
    const abs = path.resolve(file);
    return fs.existsSync(abs) ? path.relative(outDir, abs).split(path.sep).join('/') : String(file).split(path.sep).join('/');
  };

  const title = typeof opts.title === 'string' ? opts.title : L.flowReport;
  const h = [];
  h.push('<header class="top"><h1>' + u.escapeHtml(title) + '</h1><div class="sub">' +
    u.escapeHtml(L.generated) + ': ' + u.escapeHtml(model.generatedAt) + '</div></header>');

  h.push('<div class="cards">');
  h.push(u.statCard(L.scenarios, model.stats.scenarios));
  h.push(u.statCard(pageWord, model.stats.pages));
  h.push(u.statCard(L.transitions, model.stats.transitions));
  h.push(u.statCard(L.screenshots, model.stats.screenshots));
  if (model.stats.failedScenarios) h.push(u.statCard(L.failed, model.stats.failedScenarios));
  h.push('</div>');

  h.push('<h2>' + u.escapeHtml(L.diagram) + '</h2><div class="panel"><pre class="mermaid">' +
    u.escapeHtml(mermaidSrc) + '</pre><div class="sub">The Mermaid source is written next to this file; ' +
    'paste it into any Markdown viewer when the diagram cannot render offline.</div></div>');

  const trRows = model.transitions.map((e) => {
    const from = pageList.find((p) => p.key === e.from);
    const to = pageList.find((p) => p.key === e.to);
    return '<tr><td>' + u.escapeHtml(from.label) + '<div class="sub">' + u.escapeHtml(from.pathKey) + '</div></td>' +
      '<td>' + u.escapeHtml(to.label) + '<div class="sub">' + u.escapeHtml(to.pathKey) + '</div></td>' +
      '<td>' + u.escapeHtml(e.trigger) + (e.triggers.length > 1 ? '<div class="sub">+' + (e.triggers.length - 1) + '</div>' : '') + '</td>' +
      '<td class="num">' + e.count + '</td>' +
      '<td class="' + (e.failed ? 'fail' : '') + '">' + (e.failed ? u.escapeHtml(L.failed) : '') + '</td></tr>';
  }).join('');
  if (trRows) {
    h.push('<h2>' + u.escapeHtml(L.transitions) + '</h2><div class="panel"><div class="tablewrap"><table><thead><tr>' +
      '<th>' + u.escapeHtml(L.from) + '</th><th>' + u.escapeHtml(L.to) + '</th><th>' + u.escapeHtml(L.trigger) + '</th>' +
      '<th class="num">' + u.escapeHtml(L.count) + '</th><th>' + u.escapeHtml(L.status) + '</th>' +
      '</tr></thead><tbody>' + trRows + '</tbody></table></div></div>');
  }

  h.push('<h2>' + u.escapeHtml(L.scenarioPaths) + '</h2><div class="panel">');
  for (const sc of model.scenarios) {
    const chain = sc.path.map((p) => {
      const page = pageList.find((x) => x.key === p.page);
      return u.escapeHtml(page ? page.label : p.page);
    }).join(' <span class="sub">-&gt;</span> ');
    const chips = sc.tags.map((t) => '<span class="chip' + (u.REQ_TAG.test(t) ? ' req' : '') + '">' + u.escapeHtml(t) + '</span>').join('') +
      (sc.platform ? '<span class="chip">' + u.escapeHtml(sc.platform) + '</span>' : '') +
      (sc.device ? '<span class="chip">' + u.escapeHtml(sc.device) + '</span>' : '');
    h.push('<div class="pathrow"><div class="' + (sc.status === 'failed' ? 'fail' : '') + '"><strong>' +
      u.escapeHtml(sc.name) + '</strong> ' + chips + '</div><div>' + chain + '</div></div>');
  }
  h.push('</div>');

  h.push('<h2>' + u.escapeHtml(L.gallery) + ' <span class="sub">' + u.escapeHtml(pageWord) + '</span></h2>');
  for (const p of pageList) {
    const shots = p.screenshots.map((s) => '<figure><a href="' + u.escapeHtml(relShot(s.file)) + '" target="_blank" rel="noreferrer">' +
      '<img src="' + u.escapeHtml(relShot(s.file)) + '" alt="' + u.escapeHtml(s.step) + '" loading="lazy"></a>' +
      '<figcaption>' + u.escapeHtml(truncate(s.step, 80)) + '<br><span class="sub">' + u.escapeHtml(s.scenario) + '</span></figcaption></figure>').join('');
    h.push('<div class="panel"><h3>' + u.escapeHtml(p.label) + ' <span class="sub">' + u.escapeHtml(p.pathKey) + '</span></h3>' +
      '<div class="sub">' + u.escapeHtml(L.visits) + ': ' + p.visits + ' &middot; ' + u.escapeHtml(L.entryPages) + ': ' + p.entries +
      ' &middot; ' + u.escapeHtml(L.scenarios) + ': ' + p.scenarios.length + '</div>' +
      (shots ? '<div class="shots">' + shots + '</div>' : '') + '</div>');
  }

  h.push('<footer>' + u.escapeHtml(L.generated) + ': ' + u.escapeHtml(model.generatedAt) + ' &middot; bdd plugin flow-map</footer>');
  h.push('<script type="module">\n' +
    'import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")\n' +
    '  .then((m) => m.default.initialize({ startOnLoad: true,\n' +
    '     theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default" }))\n' +
    '  .catch(() => { /* offline: the Mermaid source stays readable as text */ });\n' +
    '</script>');

  const css = [
    '.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }',
    '.shots figure { margin: 0; }',
    '.shots img { width: 100%; border: 1px solid var(--line); border-radius: 8px; background: var(--chip); }',
    '.shots figcaption { font-size: 12px; margin-top: 4px; }',
    '.pathrow { margin: 10px 0; }',
    'pre.mermaid { white-space: pre-wrap; font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; overflow-x: auto; }',
  ].join('\n');

  return { model, html: u.htmlPage(title, h.join('\n'), css), mermaid: mermaidSrc };
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));
  const { records, files } = collectRecords(u.asList(opts.input).concat(opts._));
  if (!records.length) {
    console.error('flow-map: no capture records found. Run the suite with the flow-capture hooks enabled ' +
      '(BDD_FLOW_CAPTURE=1) and point --input at the capture directory (default bdd-artifacts/flow).');
    process.exit(2);
  }
  const { model, html, mermaid } = build(records, opts);
  const outFile = typeof opts.out === 'string' ? opts.out : path.join('bdd-artifacts', 'flow-map.html');
  const written = u.writeFileEnsured(outFile, html);
  const mmdFile = typeof opts.mermaid === 'string' ? opts.mermaid : outFile.replace(/\.html?$/i, '') + '.mmd';
  u.writeFileEnsured(mmdFile, mermaid + '\n');
  if (typeof opts.json === 'string') u.writeFileEnsured(opts.json, JSON.stringify(model, null, 2));

  const s = model.stats;
  console.log('flow-map: ' + files.length + ' capture file(s), ' + s.captures + ' records, ' + s.scenarios +
    ' scenarios, ' + s.pages + (s.native ? ' screens, ' : ' pages, ') + s.transitions +
    ' transitions, ' + s.screenshots + ' screenshots');
  for (const p of model.pages.filter((x) => x.entries)) console.log('  entry: ' + p.pathKey + ' (' + p.entries + ')');
  console.log('flow-map: wrote ' + written + ' and ' + path.resolve(mmdFile));
}

if (require.main === module) main();
module.exports = { build, normalizePage, normalizeScreen, collectRecords };
