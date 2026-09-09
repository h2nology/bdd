#!/usr/bin/env node
'use strict';
/**
 * Gherkin -> reviewable HTML specification report.
 *
 * Usage:
 *   node spec-report.cjs [paths...] [options]
 *
 * Options:
 *   --out <file>          Output HTML (default bdd-artifacts/spec-report.html)
 *   --json <file>         Also write the structured model as JSON
 *   --title <text>        Report title
 *   --labels <tag>        Report chrome language: en | zh-CN | zh-TW | ja (default en)
 *   --req-prefix <p>      Extra requirement tag prefix, repeatable (e.g. --req-prefix PROJ)
 *   --no-steps            Summary only: omit step-level detail
 *
 * Paths default to the usual feature roots (features/, src/test/resources/features/, ...).
 * Exit code is always 0 unless the report cannot be written; parse problems are
 * reported in the "Parse warnings" section and on stderr.
 */

const path = require('path');
const u = require('./lib/util.cjs');
const g = require('./lib/gherkin.cjs');
const { labelsFor } = require('./lib/labels.cjs');

function stepHtml(step) {
  const parts = [`<div class="step"><span class="kw">${u.escapeHtml(step.keyword)}</span><span>${u.escapeHtml(step.text)}</span></div>`];
  if (step.dataTable) parts.push(`<div class="dt">${u.renderTable(step.dataTable.rows)}</div>`);
  if (step.docString) parts.push(`<div class="ds">${u.escapeHtml(step.docString.content)}</div>`);
  return parts.join('');
}

function scenarioHtml(sc, L, showSteps) {
  const head = [];
  const kind = sc.type === 'scenarioOutline' ? L.outline : L.scenario;
  head.push(`<h3 class="scen">${u.escapeHtml(sc.name || '(unnamed)')}<span class="kind">${u.escapeHtml(kind)}</span></h3>`);
  const tagChips = sc.allTags.map((t) => `<span class="chip${u.REQ_TAG.test(t) ? ' req' : ''}">${u.escapeHtml(t)}</span>`).join('');
  if (tagChips) head.push(`<div>${tagChips}</div>`);
  if (sc.description) head.push(`<div class="desc">${u.escapeHtml(sc.description)}</div>`);
  if (showSteps) {
    head.push(sc.steps.map(stepHtml).join(''));
    for (const ex of sc.examples) {
      if (!ex.header) continue;
      head.push(`<h4>${u.escapeHtml(ex.keyword)}${ex.name ? ': ' + u.escapeHtml(ex.name) : ''}</h4>`);
      head.push(`<div class="ex">${u.renderTable([ex.header].concat(ex.rows))}</div>`);
    }
  } else {
    head.push(`<div class="sub">${sc.steps.length} ${u.escapeHtml(L.steps)} · ${g.caseCount(sc)} ${u.escapeHtml(L.cases)}</div>`);
  }
  return `<div class="panel">${head.join('')}</div>`;
}

function backgroundHtml(bg, L, showSteps) {
  if (!bg) return '';
  const body = showSteps ? bg.steps.map(stepHtml).join('') : `<div class="sub">${bg.steps.length} ${u.escapeHtml(L.steps)}</div>`;
  return `<div class="panel bgpanel"><h3 class="scen">${u.escapeHtml(bg.keyword)}${bg.name ? ': ' + u.escapeHtml(bg.name) : ''}</h3>${body}</div>`;
}

function build(features, opts) {
  const L = labelsFor(opts.labels);
  const reqPrefixes = u.asList(opts.reqPrefix);
  const showSteps = !opts.noSteps;

  const model = {
    generatedAt: u.nowStamp(),
    stats: { features: 0, rules: 0, scenarios: 0, cases: 0, steps: 0, requirements: 0 },
    requirements: {},
    tags: {},
    features: [],
    untagged: [],
    warnings: [],
  };

  for (const feature of features) {
    if (feature.name === null && feature.errors.length) {
      model.warnings.push({ uri: feature.uri, line: 1, message: feature.errors.map((e) => e.message).join('; ') });
      continue;
    }
    model.stats.features += 1;
    for (const err of feature.errors) model.warnings.push({ uri: feature.uri, line: err.line, message: err.message });

    const scenarios = g.flattenScenarios(feature);
    model.stats.rules += feature.children.filter((c) => c.type === 'rule').length;
    const fEntry = {
      uri: feature.uri, name: feature.name, tags: feature.tags,
      description: feature.description, language: feature.language,
      background: feature.background, rules: [], scenarios: [],
    };

    for (const sc of scenarios) {
      model.stats.scenarios += 1;
      model.stats.cases += g.caseCount(sc);
      model.stats.steps += g.stepCount(sc);
      const reqs = u.extractRequirements(sc.allTags, reqPrefixes);
      for (const tag of sc.allTags) model.tags[tag] = (model.tags[tag] || 0) + 1;
      const record = {
        id: sc.id, name: sc.name, type: sc.type, line: sc.line, uri: feature.uri,
        featureName: feature.name, rule: sc.rule ? sc.rule.name : null,
        tags: sc.allTags, requirements: reqs,
        steps: g.stepCount(sc), cases: g.caseCount(sc),
        instances: g.expandOutline(sc).map((inst) => ({ label: u.exampleLabel(inst), line: inst.line })),
      };
      fEntry.scenarios.push(record);
      if (!reqs.length) model.untagged.push(record);
      for (const req of reqs) {
        if (!model.requirements[req]) model.requirements[req] = [];
        model.requirements[req].push(record);
      }
    }
    model.features.push(fEntry);
  }
  model.stats.requirements = Object.keys(model.requirements).length;

  // ---- HTML ----
  const title = typeof opts.title === 'string' ? opts.title : L.specReport;
  const html = [];
  html.push(`<header class="top"><h1>${u.escapeHtml(title)}</h1>
    <div class="sub">${u.escapeHtml(L.generated)}: ${u.escapeHtml(model.generatedAt)} · ${model.stats.features} ${u.escapeHtml(L.features)}</div></header>`);

  html.push('<div class="cards">');
  html.push(u.statCard(L.features, model.stats.features));
  if (model.stats.rules) html.push(u.statCard(L.rules, model.stats.rules));
  html.push(u.statCard(L.scenarios, model.stats.scenarios));
  html.push(u.statCard(L.cases, model.stats.cases));
  html.push(u.statCard(L.steps, model.stats.steps));
  html.push(u.statCard(L.requirements, model.stats.requirements));
  html.push('</div>');

  const reqIds = Object.keys(model.requirements).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (reqIds.length) {
    const rows = reqIds.map((id) => {
      const list = model.requirements[id];
      const links = list.map((s) => `<div>${u.escapeHtml(s.featureName || '')} › ${u.escapeHtml(s.name)} <span class="sub">(${u.escapeHtml(s.uri)}:${s.line})</span></div>`).join('');
      const cases = list.reduce((n, s) => n + s.cases, 0);
      return `<tr><td><span class="chip req">${u.escapeHtml(id)}</span></td><td class="num">${list.length}</td><td class="num">${cases}</td><td>${links}</td></tr>`;
    }).join('');
    html.push(`<h2>${u.escapeHtml(L.requirementIndex)}</h2><div class="panel"><div class="tablewrap"><table>
      <thead><tr><th>${u.escapeHtml(L.requirement)}</th><th class="num">${u.escapeHtml(L.scenarios)}</th><th class="num">${u.escapeHtml(L.cases)}</th><th>${u.escapeHtml(L.coveredBy)}</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`);
  }

  if (model.untagged.length) {
    const items = model.untagged.map((s) => `<li>${u.escapeHtml(s.featureName || '')} › ${u.escapeHtml(s.name)} <span class="sub">(${u.escapeHtml(s.uri)}:${s.line})</span></li>`).join('');
    html.push(`<h2>${u.escapeHtml(L.noRequirement)} <span class="sub">(${model.untagged.length})</span></h2><div class="panel"><ul>${items}</ul></div>`);
  }

  const tagEntries = Object.entries(model.tags).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (tagEntries.length) {
    html.push(`<h2>${u.escapeHtml(L.tagIndex)}</h2><div class="panel">${tagEntries
      .map(([t, n]) => `<span class="chip${u.REQ_TAG.test(t) ? ' req' : ''}">${u.escapeHtml(t)} · ${n}</span>`).join('')}</div>`);
  }

  html.push(`<h2>${u.escapeHtml(L.features)}</h2>`);
  for (const feature of features) {
    if (feature.name === null) continue;
    const tagChips = feature.tags.map((t) => `<span class="chip${u.REQ_TAG.test(t) ? ' req' : ''}">${u.escapeHtml(t)}</span>`).join('');
    html.push(`<h3 class="feat">${u.escapeHtml(feature.name)}</h3>
      <div class="sub">${u.escapeHtml(feature.uri)} · ${u.escapeHtml(g.DIALECTS[feature.language].name)}</div>
      ${tagChips ? `<div>${tagChips}</div>` : ''}
      ${feature.description ? `<div class="desc">${u.escapeHtml(feature.description)}</div>` : ''}`);
    html.push(backgroundHtml(feature.background, L, showSteps));
    for (const child of feature.children) {
      if (child.type === 'rule') {
        html.push(`<h3 class="rule">${u.escapeHtml(child.keyword)}: ${u.escapeHtml(child.name)}</h3>`);
        if (child.description) html.push(`<div class="desc">${u.escapeHtml(child.description)}</div>`);
        html.push(backgroundHtml(child.background, L, showSteps));
        for (const sc of g.flattenScenarios({ ...feature, children: [child] })) html.push(scenarioHtml(sc, L, showSteps));
      } else {
        const flat = g.flattenScenarios({ ...feature, children: [child] })[0];
        html.push(scenarioHtml(flat, L, showSteps));
      }
    }
  }

  if (model.warnings.length) {
    const items = model.warnings.map((w) => `<li><code>${u.escapeHtml(w.uri)}:${w.line}</code> — ${u.escapeHtml(w.message)}</li>`).join('');
    html.push(`<h2>${u.escapeHtml(L.warnings)} <span class="sub">(${model.warnings.length})</span></h2><div class="panel"><ul>${items}</ul></div>`);
  }

  html.push(`<footer>${u.escapeHtml(L.generated)}: ${u.escapeHtml(model.generatedAt)} · bdd plugin spec-report</footer>`);
  return { model, html: u.htmlPage(title, html.join('\n')) };
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));
  const features = u.loadFeatures(opts._);
  if (!features.length) {
    console.error('No .feature files found. Pass explicit paths, e.g. node spec-report.cjs features/');
    process.exit(2);
  }
  const { model, html } = build(features, opts);
  const outFile = typeof opts.out === 'string' ? opts.out : path.join('bdd-artifacts', 'spec-report.html');
  const written = u.writeFileEnsured(outFile, html);
  if (typeof opts.json === 'string') u.writeFileEnsured(opts.json, JSON.stringify(model, null, 2));

  console.log(`spec-report: ${model.stats.features} features, ${model.stats.scenarios} scenarios, ` +
    `${model.stats.cases} cases, ${model.stats.steps} steps, ${model.stats.requirements} requirement ids`);
  if (model.untagged.length) {
    // Naming them matters: the caller's next action is to tag these scenarios, and
    // a bare count sends them back to grep for something this run already knows.
    console.log(`spec-report: ${model.untagged.length} scenario(s) have no requirement tag`);
    const shown = model.untagged.slice(0, 20);
    for (const sc of shown) console.log(`  untagged  ${sc.uri}:${sc.line}  ${sc.name || '(unnamed)'}`);
    if (model.untagged.length > shown.length) {
      console.log(`  ... and ${model.untagged.length - shown.length} more; the full list is in the report and the --json model`);
    }
  }
  for (const w of model.warnings) console.error(`warning: ${w.uri}:${w.line} ${w.message}`);
  console.log(`spec-report: wrote ${written}`);
}

if (require.main === module) main();
module.exports = { build };
