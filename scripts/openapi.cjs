#!/usr/bin/env node
'use strict';
/**
 * Gherkin <-> OpenAPI: extract the HTTP contract a suite actually states, and
 * report which documented operations no scenario covers.
 *
 * Usage:
 *   node openapi.cjs extract  [featurePaths...] [options]
 *   node openapi.cjs coverage [featurePaths...] --spec <openapi.yaml|json> [options]
 *
 * Options:
 *   --spec <file>          Existing OpenAPI document (coverage mode; required)
 *   --out <file>           Output HTML (coverage mode, default bdd-artifacts/openapi-coverage.html)
 *   --json <file>          Also write the structured model as JSON
 *   --labels <tag>         Report chrome language: en | zh-CN | zh-TW | ja
 *   --base-path <prefix>   Strip this prefix from scenario paths before matching (e.g. /api/v1)
 *   --keep-ids             Do not collapse /orders/1234 to /orders/{id}
 *   --req-prefix <p>       Extra requirement tag prefix, repeatable
 *   --fail-under <pct>     Exit 1 when operation coverage is below this percentage
 *
 * What this does NOT do: it never invents a path or a method. Scenarios written
 * in business language carry no HTTP facts, so they are reported separately as
 * `businessOnly` - designing an API for them is a judgement call for the caller,
 * not something this script guesses.
 *
 * Exit codes: 0 ok, 1 --fail-under not met, 2 nothing to work with.
 */

const fs = require('fs');
const path = require('path');
const u = require('./lib/util.cjs');
const g = require('./lib/gherkin.cjs');
const { labelsFor } = require('./lib/labels.cjs');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const OP_RE = new RegExp(`\\b(${METHODS.join('|')})\\b\\s*(?:request\\s*)?(?:to\\s*)?["'\`]?(/[^\\s"'\`,;)]*)`, 'i');
const STATUS_RE = /\b(?:status(?:\s+code)?|response\s+code|respond(?:s|ed)?\s+with)\D{0,12}(\d{3})\b/i;

/** OpenAPI-specific report chrome; the shared labels file covers the generic keys. */
const L2 = {
  en: { title: 'OpenAPI coverage', ops: 'Operations', covered: 'Covered', uncovered: 'Uncovered', orphan: 'In scenarios only', src: 'Covered by', none: 'No scenario covers this operation' },
  'zh-CN': { title: 'OpenAPI 覆盖率', ops: '接口操作', covered: '已覆盖', uncovered: '未覆盖', orphan: '仅出现在场景中', src: '覆盖来源', none: '没有任何场景覆盖此操作' },
  'zh-TW': { title: 'OpenAPI 覆蓋率', ops: '介面操作', covered: '已覆蓋', uncovered: '未覆蓋', orphan: '僅出現在場景中', src: '覆蓋來源', none: '沒有任何場景覆蓋此操作' },
  ja: { title: 'OpenAPI カバレッジ', ops: '操作', covered: 'カバー済み', uncovered: '未カバー', orphan: 'シナリオのみ', src: 'カバー元', none: 'この操作を検証するシナリオがありません' },
};

// ---------------------------------------------------------------- paths

/**
 * Collapse volatile path segments so `/orders/1234` and `/orders/9` are one
 * operation. Segments already written as `{id}` are left alone.
 */
function templatePath(p, keepIds) {
  const clean = p.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  if (keepIds) return clean;
  return clean.split('/').map((seg) => {
    if (!seg || /^\{.+\}$/.test(seg)) return seg;
    if (/^\d+$/.test(seg)) return '{id}';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '{uuid}';
    if (/^[0-9a-f]{16,}$/i.test(seg)) return '{hash}';
    return seg;
  }).join('/') || '/';
}

const stripBase = (p, base) => (base && p.startsWith(base) ? p.slice(base.length) || '/' : p);

// ---------------------------------------------------------------- schema

/**
 * Money is why `key` is worth passing: JSON cannot tell 25.00 from 25, so a
 * price whose example happens to be round would otherwise be typed `integer`
 * and every downstream generator would round the cents off.
 */
const MONEY_KEY = /(price|total|amount|cost|fee|balance|subtotal|discount|charge|tax|refund)/i;

/** Infer a JSON Schema fragment from one concrete example value. */
function inferSchema(value, key) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    const items = value.length ? value.map((v) => inferSchema(v, key)).reduce(mergeSchema) : {};
    return { type: 'array', items };
  }
  if (typeof value === 'object') {
    const properties = {};
    for (const [k, v] of Object.entries(value)) properties[k] = inferSchema(v, k);
    return { type: 'object', properties, required: Object.keys(value).sort() };
  }
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return { type: 'number' };
    return MONEY_KEY.test(key || '') ? { type: 'number' } : { type: 'integer' };
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(s)) return { type: 'string', format: 'date-time' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { type: 'string', format: 'date' };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return { type: 'string', format: 'email' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { type: 'string', format: 'uuid' };
  return { type: 'string' };
}

/**
 * Merge two inferred schemas. `required` narrows to the intersection: a field
 * missing from any one example is, on this evidence, optional.
 */
function mergeSchema(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.type !== b.type) return { anyOf: [a, b] };
  if (a.type === 'object') {
    const properties = Object.assign({}, a.properties);
    for (const [k, v] of Object.entries(b.properties || {})) {
      properties[k] = properties[k] ? mergeSchema(properties[k], v) : v;
    }
    const req = (a.required || []).filter((k) => (b.required || []).includes(k));
    return { type: 'object', properties, required: req };
  }
  if (a.type === 'array') return { type: 'array', items: mergeSchema(a.items, b.items) };
  if (a.format && b.format && a.format !== b.format) return { type: a.type };
  return a.format ? a : b;
}

/** Column headers of a data table are field names; the rows give their types. */
function schemaFromTable(table) {
  if (!table || !table.rows || table.rows.length < 2) return null;
  const header = table.rows[0].cells.map((c) => String(c).trim());
  const properties = {};
  for (let i = 0; i < header.length; i += 1) {
    const samples = table.rows.slice(1).map((r) => r.cells[i]).filter((v) => v !== undefined && v !== '');
    if (!samples.length) { properties[header[i]] = { type: 'string' }; continue; }
    properties[header[i]] = samples
      .map((v) => inferSchema(/^-?\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : v, header[i]))
      .reduce(mergeSchema);
  }
  return { type: 'object', properties, required: header.slice() };
}

const parseJsonMaybe = (text) => {
  if (!text) return undefined;
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
};

// ---------------------------------------------------------------- extraction

/**
 * Walk every scenario and pick up the HTTP facts it states outright. A step
 * contributes to the operation named most recently before it, which is how a
 * `When I POST /orders` / `Then the response status is 201` pair reads.
 */
function extract(features, opts) {
  const keepIds = Boolean(opts.keepIds);
  const base = typeof opts.basePath === 'string' ? opts.basePath.replace(/\/+$/, '') : '';
  const ops = new Map();
  const businessOnly = [];
  let scenarioCount = 0;

  for (const feature of features) {
    for (const sc of g.flattenScenarios(feature)) {
      scenarioCount += 1;
      const reqs = u.extractRequirements(sc.allTags, u.asList(opts.reqPrefix));
      let touched = false;

      for (const inst of g.expandOutline(sc)) {
        const steps = (sc.backgroundSteps || []).concat(inst.steps);
        let current = null;
        let effective = null; // And/But continue whatever came before them
        for (const step of steps) {
          const kind = step.keywordType === 'and' || step.keywordType === 'but' ? effective : step.keywordType;
          if (kind) effective = kind;
          const m = OP_RE.exec(step.text);
          if (m) {
            const method = m[1].toUpperCase();
            const p = templatePath(stripBase(m[2], base), keepIds);
            const key = `${method} ${p}`;
            if (!ops.has(key)) {
              ops.set(key, {
                method, path: p, statuses: [], requestSchema: null, responseSchemas: {},
                sources: [], requirements: [], confidence: 'derived',
              });
            }
            current = ops.get(key);
            touched = true;
            const src = { uri: feature.uri, line: sc.line, scenario: sc.name };
            if (!current.sources.some((s) => s.uri === src.uri && s.line === src.line)) current.sources.push(src);
            for (const r of reqs) if (!current.requirements.includes(r)) current.requirements.push(r);
          }
          if (!current) continue;

          const st = STATUS_RE.exec(step.text);
          const status = st ? Number(st[1]) : null;
          if (status && !current.statuses.includes(status)) current.statuses.push(status);

          const body = parseJsonMaybe(step.docString && step.docString.content);
          const table = schemaFromTable(step.dataTable);
          const payload = body !== undefined ? inferSchema(body) : table;
          if (!payload) continue;

          // given/when describe what is sent; then describes what comes back.
          const isResponse = kind === 'then' || status !== null;
          if (isResponse) {
            const code = String(status || current.statuses[current.statuses.length - 1] || 200);
            current.responseSchemas[code] = mergeSchema(current.responseSchemas[code], payload);
          } else {
            current.requestSchema = mergeSchema(current.requestSchema, payload);
          }
        }
      }
      if (!touched) {
        businessOnly.push({ uri: feature.uri, line: sc.line, scenario: sc.name, requirements: reqs });
      }
    }
  }

  const operations = Array.from(ops.values()).map((op) => {
    op.statuses.sort((a, b) => a - b);
    // A path with no status and no payload is a mention, not a documented contract.
    if (!op.statuses.length && !op.requestSchema && !Object.keys(op.responseSchemas).length) op.confidence = 'inferred';
    return op;
  }).sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));

  return {
    generatedAt: u.nowStamp(),
    stats: { scenarios: scenarioCount, operations: operations.length, businessOnly: businessOnly.length },
    operations,
    businessOnly,
  };
}

// ---------------------------------------------------------------- spec reading

/**
 * Read the operations out of an existing document. JSON is parsed properly; for
 * YAML only the `paths:` block is scanned line by line, which is enough to list
 * operations and avoids shipping a YAML parser. `$ref`-ed path items and YAML
 * anchors are therefore not followed - the report says so.
 */
function readSpecOperations(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  if (/\.json$/i.test(file) || text.trim().startsWith('{')) {
    const doc = JSON.parse(text);
    for (const [p, item] of Object.entries(doc.paths || {})) {
      for (const method of Object.keys(item || {})) {
        if (!METHODS.includes(method.toUpperCase())) continue;
        out.push({ method: method.toUpperCase(), path: p, summary: (item[method] || {}).summary || '', operationId: (item[method] || {}).operationId || '' });
      }
    }
    return { operations: out, partial: false };
  }

  const lines = text.split(/\r?\n/);
  const indentOf = (l) => l.length - l.replace(/^\s*/, '').length;
  let pathsIndent = -1;
  let currentPath = null;
  let pathIndent = -1;
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const ind = indentOf(line);
    const body = line.trim();
    if (pathsIndent < 0) {
      if (/^paths:\s*$/.test(body)) pathsIndent = ind;
      continue;
    }
    if (ind <= pathsIndent) break; // left the paths block
    const pm = /^(\/[^\s:]*)\s*:\s*$/.exec(body);
    if (pm && (currentPath === null || ind <= pathIndent)) {
      currentPath = pm[1];
      pathIndent = ind;
      continue;
    }
    if (!currentPath) continue;
    const om = /^([a-z]+)\s*:\s*$/.exec(body);
    if (om && ind > pathIndent && METHODS.includes(om[1].toUpperCase())) {
      out.push({ method: om[1].toUpperCase(), path: currentPath, summary: '', operationId: '' });
    }
  }
  return { operations: out, partial: true };
}

// ---------------------------------------------------------------- coverage

function buildCoverage(model, spec, opts) {
  const keepIds = Boolean(opts.keepIds);
  const base = typeof opts.basePath === 'string' ? opts.basePath.replace(/\/+$/, '') : '';
  const seen = new Map();
  for (const op of model.operations) seen.set(`${op.method} ${op.path}`, op);

  const rows = spec.operations.map((so) => {
    const key = `${so.method} ${templatePath(stripBase(so.path, base), keepIds)}`;
    const hit = seen.get(key);
    seen.delete(key);
    return { method: so.method, path: so.path, summary: so.summary, operationId: so.operationId, covered: Boolean(hit), sources: hit ? hit.sources : [], requirements: hit ? hit.requirements : [] };
  });
  const orphans = Array.from(seen.values());
  const covered = rows.filter((r) => r.covered).length;
  return {
    generatedAt: model.generatedAt,
    stats: {
      specOperations: rows.length,
      covered,
      uncovered: rows.length - covered,
      orphans: orphans.length,
      businessOnly: model.stats.businessOnly,
      coveragePct: rows.length ? Math.round((covered / rows.length) * 100) : 0,
    },
    partialSpecRead: spec.partial,
    operations: rows,
    orphans,
    businessOnly: model.businessOnly,
  };
}

function coverageHtml(cov, opts) {
  const L = labelsFor(opts.labels);
  const T = L2[opts.labels] || L2.en;
  const h = [];
  h.push(`<header class="top"><h1>${u.escapeHtml(T.title)}</h1><div class="sub">${u.escapeHtml(cov.generatedAt)}</div></header>`);
  h.push('<div class="cards">');
  h.push(u.statCard(T.ops, cov.stats.specOperations));
  h.push(u.statCard(T.covered, cov.stats.covered));
  h.push(u.statCard(T.uncovered, cov.stats.uncovered));
  h.push(u.statCard(T.orphan, cov.stats.orphans));
  h.push('</div>');
  h.push(u.progressBar(cov.stats.coveragePct));
  if (cov.partialSpecRead) {
    h.push('<div class="panel sub">YAML was read with a line scanner: <code>$ref</code>-ed path items and anchors are not followed. Convert to JSON for an exact list.</div>');
  }

  // renderTable takes {cells} rows and escapes every cell, so sources are joined
  // with a plain separator rather than markup.
  const locs = (list) => list.map((s) => `${s.uri}:${s.line}`).join('; ');
  const rows = [{ cells: ['Method', 'Path', T.covered, T.src, L.requirements] }].concat(cov.operations.map((r) => ({
    cells: [
      r.method, r.path, r.covered ? '✓' : '✗',
      r.covered ? locs(r.sources) : T.none,
      r.requirements.join(' '),
    ],
  })));
  h.push(`<h2>${u.escapeHtml(T.ops)}</h2>`);
  h.push(u.renderTable(rows));

  if (cov.orphans.length) {
    h.push(`<h2>${u.escapeHtml(T.orphan)} <span class="sub">(${cov.orphans.length})</span></h2>`);
    h.push(u.renderTable([{ cells: ['Method', 'Path', L.scenario] }].concat(cov.orphans.map((o) => ({
      cells: [o.method, o.path, locs(o.sources)],
    })))));
  }
  if (cov.businessOnly.length) {
    h.push(`<h2>${u.escapeHtml(L.scenario)} <span class="sub">(${cov.businessOnly.length}, no HTTP facts stated)</span></h2>`);
    h.push(u.renderTable([{ cells: [L.scenario, 'Location', L.requirements] }].concat(cov.businessOnly.map((b) => ({
      cells: [b.scenario || '(unnamed)', `${b.uri}:${b.line}`, b.requirements.join(' ')],
    })))));
  }
  return u.htmlPage(T.title, h.join('\n'));
}

// ---------------------------------------------------------------- cli

function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0] === 'coverage' ? 'coverage' : 'extract';
  const opts = u.parseArgs(argv[0] === 'extract' || argv[0] === 'coverage' ? argv.slice(1) : argv);
  const features = u.loadFeatures(opts._);
  if (!features.length) {
    console.error('No .feature files found. Pass explicit paths, e.g. node openapi.cjs extract features/');
    process.exit(2);
  }
  const model = extract(features, opts);

  if (mode === 'extract') {
    if (typeof opts.json === 'string') u.writeFileEnsured(opts.json, JSON.stringify(model, null, 2));
    console.log(`openapi: ${model.stats.scenarios} scenarios -> ${model.stats.operations} operation(s) stated outright`);
    for (const op of model.operations) {
      console.log(`  ${op.confidence === 'derived' ? 'DERIVED ' : 'INFERRED'}  ${op.method} ${op.path}` +
        `${op.statuses.length ? `  [${op.statuses.join(', ')}]` : ''}  (${op.sources.length} scenario(s))`);
    }
    if (model.stats.businessOnly) {
      console.log(`openapi: ${model.stats.businessOnly} scenario(s) state no HTTP facts - they cannot yield an operation on their own:`);
      for (const b of model.businessOnly.slice(0, 20)) console.log(`  business-only  ${b.uri}:${b.line}  ${b.scenario || '(unnamed)'}`);
      if (model.businessOnly.length > 20) console.log(`  ... and ${model.businessOnly.length - 20} more`);
    }
    return;
  }

  if (typeof opts.spec !== 'string') {
    console.error('coverage mode needs --spec <openapi.yaml|json>');
    process.exit(2);
  }
  if (!fs.existsSync(opts.spec)) {
    console.error(`Spec file not found: ${opts.spec}`);
    process.exit(2);
  }
  const spec = readSpecOperations(opts.spec);
  if (!spec.operations.length) {
    console.error(`No operations found in ${opts.spec}. Check that it has a paths: block.`);
    process.exit(2);
  }
  const cov = buildCoverage(model, spec, opts);
  const outFile = typeof opts.out === 'string' ? opts.out : path.join('bdd-artifacts', 'openapi-coverage.html');
  const written = u.writeFileEnsured(outFile, coverageHtml(cov, opts));
  if (typeof opts.json === 'string') u.writeFileEnsured(opts.json, JSON.stringify(cov, null, 2));

  console.log(`openapi: ${cov.stats.covered}/${cov.stats.specOperations} documented operations covered (${cov.stats.coveragePct}%)`);
  for (const r of cov.operations.filter((x) => !x.covered)) console.log(`  UNCOVERED  ${r.method} ${r.path}`);
  for (const o of cov.orphans) console.log(`  NOT-IN-SPEC  ${o.method} ${o.path}  (${o.sources.map((s) => `${s.uri}:${s.line}`).join(', ')})`);
  if (cov.stats.businessOnly) console.log(`openapi: ${cov.stats.businessOnly} scenario(s) state no HTTP facts and are not counted either way`);
  console.log(`openapi: wrote ${written}`);

  const floor = Number(opts.failUnder);
  if (typeof opts.failUnder !== 'undefined' && !Number.isNaN(floor) && cov.stats.coveragePct < floor) {
    console.error(`openapi: coverage ${cov.stats.coveragePct}% is below --fail-under ${floor}`);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { extract, inferSchema, mergeSchema, templatePath, readSpecOperations, buildCoverage };
