#!/usr/bin/env node
'use strict';
/**
 * Requirement coverage + execution report for a cucumber suite.
 *
 * Usage:
 *   node coverage.cjs [featurePaths...] [--results <file>]... [options]
 *
 * Options:
 *   --results <file>       Cucumber messages ndjson, cucumber json, or JUnit xml.
 *                          Repeatable. Omit to report spec-side coverage only.
 *   --requirements <file>  Declared requirement backlog (json / txt / md / csv).
 *                          Without it, only tagged requirements are known and
 *                          "requirements with no scenario at all" cannot be detected.
 *   --out <file>           Output HTML (default bdd-artifacts/coverage.html)
 *   --json <file>          Also write the structured model as JSON
 *   --labels <tag>         Report chrome language: en | zh-CN | zh-TW | ja
 *   --req-prefix <p>       Extra requirement tag prefix, repeatable
 *   --fail-under <pct>     Exit 1 when requirement coverage is below this percentage
 *   --fail-on-failed       Exit 1 when any executed case failed
 *
 * Requirement status: uncovered | not-executed | partial | failed | undefined | passed
 */

const fs = require('fs');
const path = require('path');
const u = require('./lib/util.cjs');
const g = require('./lib/gherkin.cjs');
const { loadResults } = require('./lib/results.cjs');
const { labelsFor } = require('./lib/labels.cjs');

const ID_RE = /^[A-Za-z][A-Za-z0-9]*[-_:]?[A-Za-z0-9.]+$/;

/**
 * Tags whose scenarios are never executed by design. They still count in the
 * specification - that is the point of them - so they must not be mistaken for
 * a filtered run. Kept in step with the `tags` default the bdd-setup skill
 * writes into the runner config.
 */
const NEVER_EXECUTED_TAGS = ['@wip', '@manual'];

function loadRequirements(file) {
  if (!file || !fs.existsSync(file)) return [];
  if (file.toLowerCase().endsWith('.json')) {
    const data = u.readJsonMaybe(file);
    if (Array.isArray(data)) {
      return data.map((item) => (typeof item === 'string'
        ? { id: item, title: '' }
        : { id: String(item.id || item.key || item.name || ''), title: String(item.title || item.summary || item.description || '') }))
        .filter((r) => r.id);
    }
    if (data && typeof data === 'object') {
      return Object.entries(data).map(([id, title]) => ({ id, title: typeof title === 'string' ? title : '' }));
    }
    return [];
  }
  const out = [];
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    line = line.replace(/^[-*+]\s+/, '').replace(/^\|\s*/, '').replace(/\s*\|$/, '');
    const parts = line.split(/\s*[|,\t]\s*|\s{2,}|\s*[:：]\s*|\s+/);
    const id = (parts[0] || '').replace(/^@/, '').trim();
    if (!id || !ID_RE.test(id)) continue;
    if (/^(id|requirement|req)$/i.test(id)) continue;
    out.push({ id, title: line.slice(parts[0].length).replace(/^[\s|,:：\t-]+/, '').trim() });
  }
  return out;
}

function normName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function uriKeys(uri) {
  if (!uri) return [];
  const clean = String(uri).split('\\').join('/');
  const keys = [clean];
  const base = clean.split('/').pop();
  keys.push(base);
  const idx = clean.lastIndexOf('features/');
  if (idx !== -1) keys.push(clean.slice(idx + 'features/'.length));
  return Array.from(new Set(keys));
}

function buildSpecIndex(features, reqPrefixes) {
  const scenarios = [];
  const index = new Map(); // key -> scenario record

  const addKey = (key, record) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, record);
  };

  for (const feature of features) {
    if (feature.name === null) continue;
    for (const sc of g.flattenScenarios(feature)) {
      const record = {
        id: sc.id,
        uri: feature.uri,
        featureName: feature.name,
        name: sc.name,
        type: sc.type,
        line: sc.line,
        rule: sc.rule ? sc.rule.name : null,
        tags: sc.allTags,
        requirements: u.extractRequirements(sc.allTags, reqPrefixes),
        cases: g.caseCount(sc),
        steps: g.stepCount(sc),
        instanceLabels: g.expandOutline(sc).map((inst) => normName(inst.name)),
        executions: [],
      };
      scenarios.push(record);
      const names = Array.from(new Set([normName(sc.name)].concat(record.instanceLabels)));
      for (const key of uriKeys(feature.uri)) {
        for (const name of names) addKey(`${key}::${name}`, record);
      }
      for (const name of names) addKey(`::${name}`, record);
    }
  }
  return { scenarios, index };
}

function matchResults(specIndex, cases) {
  const orphans = [];
  for (const c of cases) {
    const name = normName(c.scenarioName);
    let hit = null;
    for (const key of uriKeys(c.uri)) {
      hit = specIndex.index.get(`${key}::${name}`);
      if (hit) break;
    }
    if (!hit) hit = specIndex.index.get(`::${name}`);
    if (!hit && c.classname) hit = specIndex.index.get(`::${normName(c.classname)}`);
    if (hit) hit.executions.push(c);
    else orphans.push(c);
  }
  return orphans;
}

function scenarioStatus(record) {
  if (!record.executions.length) return 'not-executed';
  const statuses = record.executions.map((e) => e.status);
  if (statuses.includes('failed') || statuses.includes('ambiguous')) return 'failed';
  if (statuses.includes('undefined')) return 'undefined';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.every((s) => s === 'skipped')) return 'skipped';
  if (statuses.includes('passed')) return 'passed';
  return 'unknown';
}

function requirementStatus(records) {
  if (!records.length) return 'uncovered';
  const statuses = records.map(scenarioStatus);
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('undefined') || statuses.includes('pending')) return 'undefined';
  if (statuses.every((s) => s === 'not-executed')) return 'not-executed';
  if (statuses.includes('not-executed')) return 'partial';
  if (statuses.every((s) => s === 'passed')) return 'passed';
  return 'partial';
}

const STATUS_CLASS = {
  passed: 'pass', failed: 'fail', undefined: 'pending', pending: 'pending',
  skipped: 'skipped', 'not-executed': 'skipped', uncovered: 'fail', partial: 'pending', unknown: 'skipped',
};

function statusLabel(status, L) {
  return {
    passed: L.passed, failed: L.failed, undefined: L.undefinedSteps, pending: L.pending,
    skipped: L.skipped, 'not-executed': L.notExecuted, uncovered: L.uncovered,
    partial: `${L.covered} / ${L.notExecuted}`, unknown: '?',
  }[status] || status;
}

function build(features, results, declared, opts) {
  const L = labelsFor(opts.labels);
  const reqPrefixes = u.asList(opts.reqPrefix);
  const spec = buildSpecIndex(features, reqPrefixes);
  const orphans = matchResults(spec, results.cases);

  const byRequirement = new Map();
  for (const req of declared) if (!byRequirement.has(req.id)) byRequirement.set(req.id, { id: req.id, title: req.title, declared: true, scenarios: [] });
  for (const sc of spec.scenarios) {
    for (const id of sc.requirements) {
      if (!byRequirement.has(id)) byRequirement.set(id, { id, title: '', declared: false, scenarios: [] });
      byRequirement.get(id).scenarios.push(sc);
    }
  }
  const requirements = Array.from(byRequirement.values()).map((r) => Object.assign(r, {
    status: requirementStatus(r.scenarios),
    cases: r.scenarios.reduce((n, s) => n + s.cases, 0),
    executed: r.scenarios.filter((s) => s.executions.length).length,
  })).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

  const executedScenarios = spec.scenarios.filter((s) => s.executions.length);
  const totalReq = requirements.length;
  const coveredReq = requirements.filter((r) => r.scenarios.length).length;
  const passedReq = requirements.filter((r) => r.status === 'passed').length;

  /**
   * Scenarios the results file says nothing about, excluding the ones nobody
   * expects to run. `@wip` and `@manual` are always excluded from execution and
   * still count in the specification, so comparing raw totals would cry wolf on
   * every project that uses them.
   *
   * Anything left is a scenario that should have run and did not - almost always
   * because the results file came from a filtered run, which makes every number
   * below understate what the suite actually verifies.
   */
  const unexecuted = spec.scenarios.filter(
    (s) => !s.executions.length && !NEVER_EXECUTED_TAGS.some((t) => s.tags.includes(t)),
  );

  const model = {
    generatedAt: u.nowStamp(),
    sources: results.sources,
    stats: {
      features: features.filter((f) => f.name !== null).length,
      scenarios: spec.scenarios.length,
      cases: spec.scenarios.reduce((n, s) => n + s.cases, 0),
      executedScenarios: executedScenarios.length,
      executedCases: results.cases.length,
      requirements: totalReq,
      declaredRequirements: declared.length,
      coveredRequirements: coveredReq,
      uncoveredRequirements: totalReq - coveredReq,
      passedRequirements: passedReq,
      specCoverage: u.pct(coveredReq, totalReq),
      execCoverage: u.pct(executedScenarios.length, spec.scenarios.length),
      passRate: u.pct(results.stats.passed, results.cases.length),
      resultStats: results.stats,
      orphans: orphans.length,
      unexecutedScenarios: unexecuted.length,
    },
    requirements: requirements.map((r) => ({
      id: r.id, title: r.title, declared: r.declared, status: r.status,
      cases: r.cases, executed: r.executed,
      scenarios: r.scenarios.map((s) => ({
        uri: s.uri, name: s.name, line: s.line, status: scenarioStatus(s),
        executions: s.executions.length, cases: s.cases,
      })),
    })),
    scenarios: spec.scenarios.map((s) => ({
      uri: s.uri, featureName: s.featureName, name: s.name, line: s.line, type: s.type,
      requirements: s.requirements, tags: s.tags, cases: s.cases,
      status: scenarioStatus(s),
      durationMs: s.executions.reduce((n, e) => n + (e.durationMs || 0), 0),
      failures: s.executions.filter((e) => e.status === 'failed').map((e) => e.failedStep).filter(Boolean),
    })),
    untaggedScenarios: spec.scenarios.filter((s) => !s.requirements.length)
      .map((s) => ({ uri: s.uri, name: s.name, line: s.line })),
    unexecutedScenarios: unexecuted.map((s) => ({ uri: s.uri, name: s.name, line: s.line })),
    orphanCases: orphans.map((o) => ({ name: o.scenarioName, uri: o.uri, status: o.status })),
  };

  // ---- HTML ----
  const title = typeof opts.title === 'string' ? opts.title : L.coverageReport;
  const h = [];
  h.push(`<header class="top"><h1>${u.escapeHtml(title)}</h1>
    <div class="sub">${u.escapeHtml(L.generated)}: ${u.escapeHtml(model.generatedAt)}${
    results.sources.length ? ' · ' + u.escapeHtml(results.sources.map((s) => `${s.file} (${s.format})`).join(', ')) : ''}</div></header>`);

  h.push('<div class="cards">');
  h.push(u.statCard(L.requirements, model.stats.requirements));
  h.push(u.statCard(L.covered, model.stats.coveredRequirements, u.progressBar(model.stats.specCoverage)));
  h.push(u.statCard(L.uncovered, model.stats.uncoveredRequirements));
  h.push(u.statCard(L.scenarios, model.stats.scenarios));
  h.push(u.statCard(L.execCoverage, `${model.stats.execCoverage}%`, u.progressBar(model.stats.execCoverage)));
  if (results.cases.length) {
    h.push(u.statCard(L.passRate, `${model.stats.passRate}%`, u.progressBar(model.stats.passRate)));
    h.push(u.statCard(L.failed, results.stats.failed));
    if (results.stats.undefined) h.push(u.statCard(L.undefinedSteps, results.stats.undefined));
  }
  h.push('</div>');

  const reqRows = requirements.map((r) => {
    const scLinks = r.scenarios.length
      ? r.scenarios.map((s) => `<div class="${STATUS_CLASS[scenarioStatus(s)]}">${u.escapeHtml(s.name)} <span class="sub">(${u.escapeHtml(s.uri)}:${s.line})</span></div>`).join('')
      : `<span class="fail">${u.escapeHtml(L.none)}</span>`;
    return `<tr>
      <td><span class="chip req">${u.escapeHtml(r.id)}</span>${r.declared && r.title ? `<div class="sub">${u.escapeHtml(r.title)}</div>` : ''}</td>
      <td class="${STATUS_CLASS[r.status]}">${u.escapeHtml(statusLabel(r.status, L))}</td>
      <td class="num">${r.scenarios.length}</td><td class="num">${r.cases}</td><td class="num">${r.executed}</td>
      <td>${scLinks}</td></tr>`;
  }).join('');
  h.push(`<h2>${u.escapeHtml(L.byRequirement)}</h2><div class="panel"><div class="tablewrap"><table><thead><tr>
    <th>${u.escapeHtml(L.requirement)}</th><th>${u.escapeHtml(L.status)}</th>
    <th class="num">${u.escapeHtml(L.scenarios)}</th><th class="num">${u.escapeHtml(L.cases)}</th>
    <th class="num">${u.escapeHtml(L.executed)}</th><th>${u.escapeHtml(L.coveredBy)}</th>
    </tr></thead><tbody>${reqRows}</tbody></table></div></div>`);

  const scRows = model.scenarios.map((s) => `<tr>
    <td>${u.escapeHtml(s.name)}<div class="sub">${u.escapeHtml(s.uri)}:${s.line}</div>
      ${s.failures.length ? `<div class="fail sub">${u.escapeHtml(String(s.failures[0]).split('\n')[0].slice(0, 200))}</div>` : ''}</td>
    <td>${s.requirements.map((r) => `<span class="chip req">${u.escapeHtml(r)}</span>`).join('') || `<span class="sub">${u.escapeHtml(L.none)}</span>`}</td>
    <td class="${STATUS_CLASS[s.status]}">${u.escapeHtml(statusLabel(s.status, L))}</td>
    <td class="num">${s.cases}</td>
    <td class="num">${s.durationMs ? Math.round(s.durationMs) + ' ms' : ''}</td></tr>`).join('');
  h.push(`<h2>${u.escapeHtml(L.scenarios)}</h2><div class="panel"><div class="tablewrap"><table><thead><tr>
    <th>${u.escapeHtml(L.scenario)}</th><th>${u.escapeHtml(L.requirements)}</th><th>${u.escapeHtml(L.status)}</th>
    <th class="num">${u.escapeHtml(L.cases)}</th><th class="num">${u.escapeHtml(L.duration)}</th>
    </tr></thead><tbody>${scRows}</tbody></table></div></div>`);

  if (model.untaggedScenarios.length) {
    h.push(`<h2>${u.escapeHtml(L.noRequirement)} <span class="sub">(${model.untaggedScenarios.length})</span></h2>
      <div class="panel"><ul>${model.untaggedScenarios.map((s) => `<li>${u.escapeHtml(s.name)} <span class="sub">(${u.escapeHtml(s.uri)}:${s.line})</span></li>`).join('')}</ul></div>`);
  }
  if (model.orphanCases.length) {
    h.push(`<h2>${u.escapeHtml(L.orphanTests)} <span class="sub">(${model.orphanCases.length})</span></h2>
      <div class="panel"><ul>${model.orphanCases.map((o) => `<li>${u.escapeHtml(o.name)} <span class="sub">${u.escapeHtml(o.status)}</span></li>`).join('')}</ul></div>`);
  }

  h.push(`<footer>${u.escapeHtml(L.generated)}: ${u.escapeHtml(model.generatedAt)} · bdd plugin coverage</footer>`);
  return { model, html: u.htmlPage(title, h.join('\n')) };
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));
  const features = u.loadFeatures(opts._);
  if (!features.length) {
    console.error('No .feature files found. Pass explicit paths, e.g. node coverage.cjs features/ --results out.ndjson');
    process.exit(2);
  }
  const resultFiles = u.asList(opts.results);
  const results = loadResults(resultFiles);
  const declared = loadRequirements(typeof opts.requirements === 'string' ? opts.requirements : null);
  const { model, html } = build(features, results, declared, opts);

  const outFile = typeof opts.out === 'string' ? opts.out : path.join('bdd-artifacts', 'coverage.html');
  const written = u.writeFileEnsured(outFile, html);
  if (typeof opts.json === 'string') u.writeFileEnsured(opts.json, JSON.stringify(model, null, 2));

  const s = model.stats;
  console.log(`coverage: requirements ${s.coveredRequirements}/${s.requirements} covered (${s.specCoverage}%)` +
    (s.declaredRequirements ? ` · backlog of ${s.declaredRequirements} declared` : ' · no backlog file supplied'));
  console.log(`coverage: scenarios ${s.executedScenarios}/${s.scenarios} executed (${s.execCoverage}%), ` +
    `${s.executedCases} case results: ${s.resultStats.passed} passed, ${s.resultStats.failed} failed, ` +
    `${s.resultStats.undefined} undefined, ${s.resultStats.pending} pending, ${s.resultStats.skipped} skipped`);
  for (const r of model.requirements.filter((r) => r.status !== 'passed')) {
    console.log(`  ${r.status.toUpperCase().padEnd(13)} ${r.id}${r.title ? ' — ' + r.title : ''}${r.scenarios.length ? '' : ' (no scenario)'}`);
  }
  if (model.untaggedScenarios.length) console.log(`coverage: ${model.untaggedScenarios.length} scenario(s) carry no requirement tag`);
  if (model.orphanCases.length) console.log(`coverage: ${model.orphanCases.length} executed case(s) matched no scenario in the specs`);
  // A results file that covers only part of the specification makes every number
  // above understate what the suite verifies. Say so on stderr, loudly, rather
  // than letting a filtered run be read as a measurement of the whole suite.
  if (results.cases.length && model.stats.unexecutedScenarios) {
    console.error(`warning: ${model.stats.unexecutedScenarios} scenario(s) have no result in ` +
      `${results.sources.map((src) => src.file).join(', ')} - this looks like a FILTERED run, ` +
      'so the coverage figures above understate the suite. Re-run without a tag or path filter ' +
      'before reporting them:');
    for (const sc of model.unexecutedScenarios.slice(0, 10)) {
      console.error(`  ${sc.uri}:${sc.line}  ${sc.name}`);
    }
    const rest = model.unexecutedScenarios.length - 10;
    if (rest > 0) console.error(`  ... and ${rest} more`);
  }
  for (const src of results.sources) if (src.format === 'missing' || src.format === 'unrecognized') console.error(`warning: results file ${src.file} is ${src.format}`);
  console.log(`coverage: wrote ${written}`);

  let exit = 0;
  const failUnder = parseFloat(opts.failUnder);
  if (!Number.isNaN(failUnder) && s.specCoverage < failUnder) {
    console.error(`coverage: FAIL requirement coverage ${s.specCoverage}% is below --fail-under ${failUnder}%`);
    exit = 1;
  }
  if (opts.failOnFailed && s.resultStats.failed > 0) {
    console.error(`coverage: FAIL ${s.resultStats.failed} case(s) failed`);
    exit = 1;
  }
  process.exit(exit);
}

if (require.main === module) main();
module.exports = { build, loadRequirements };
