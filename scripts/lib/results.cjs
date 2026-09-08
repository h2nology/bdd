'use strict';
/**
 * Load cucumber execution results from whatever format the language stack emits.
 *
 * Supported inputs (auto-detected by content):
 *   1. Cucumber Messages NDJSON  — cucumber-js `--format message:file.ndjson`,
 *      cucumber-jvm `message:target/cucumber.ndjson` (preferred: richest data)
 *   2. Legacy Cucumber JSON      — cucumber-jvm `json:`, pytest-bdd `--cucumber-json`,
 *      cucumber-js <= 8 `--format json`
 *   3. JUnit XML                 — best effort fallback (Reqnroll, pytest, JUnit runners);
 *      carries no tags, so requirement mapping falls back to spec-side tags
 *
 * Normalized output:
 *   { format, cases: [{ uri, scenarioName, tags, line, status, durationMs, steps,
 *                       failedStep, undefinedSteps }], stats }
 */

const fs = require('fs');
const u = require('./util.cjs');

const STATUS_ORDER = ['passed', 'skipped', 'pending', 'undefined', 'ambiguous', 'failed', 'unknown'];

function normStatus(raw) {
  const s = String(raw || 'unknown').toLowerCase();
  if (s === 'success' || s === 'passed') return 'passed';
  if (s === 'failure' || s === 'failed' || s === 'error') return 'failed';
  if (s === 'undefined') return 'undefined';
  if (s === 'pending') return 'pending';
  if (s === 'skipped' || s === 'notexecuted') return 'skipped';
  if (s === 'ambiguous') return 'ambiguous';
  return 'unknown';
}

/** Worst-wins aggregation, so a scenario is never reported greener than its steps. */
function worst(statuses) {
  let idx = -1;
  for (const s of statuses) {
    const i = STATUS_ORDER.indexOf(normStatus(s));
    if (i > idx) idx = i;
  }
  return idx === -1 ? 'unknown' : STATUS_ORDER[idx];
}

function fromMessages(envelopes) {
  const pickles = new Map();      // pickleId -> pickle
  const testCases = new Map();    // testCaseId -> { pickleId, stepIds }
  const started = new Map();      // testCaseStartedId -> { testCaseId, timestamp }
  const stepStatuses = new Map(); // testCaseStartedId -> [{status, message, durationMs}]
  const finished = [];            // { testCaseStartedId, durationMs }

  const ts = (t) => (t ? Number(t.seconds || 0) * 1000 + Number(t.nanos || 0) / 1e6 : 0);

  for (const env of envelopes) {
    if (env.pickle) pickles.set(env.pickle.id, env.pickle);
    else if (env.testCase) testCases.set(env.testCase.id, env.testCase);
    else if (env.testCaseStarted) started.set(env.testCaseStarted.id, { testCaseId: env.testCaseStarted.testCaseId, at: ts(env.testCaseStarted.timestamp) });
    else if (env.testStepFinished) {
      const id = env.testStepFinished.testCaseStartedId;
      const res = env.testStepFinished.testStepResult || {};
      if (!stepStatuses.has(id)) stepStatuses.set(id, []);
      stepStatuses.get(id).push({
        status: normStatus(res.status),
        message: res.message || null,
        durationMs: res.duration ? Number(res.duration.seconds || 0) * 1000 + Number(res.duration.nanos || 0) / 1e6 : 0,
      });
    } else if (env.testCaseFinished) {
      finished.push({ id: env.testCaseFinished.testCaseStartedId, at: ts(env.testCaseFinished.timestamp) });
    }
  }

  const cases = [];
  for (const [startedId, info] of started) {
    const testCase = testCases.get(info.testCaseId);
    const pickle = testCase ? pickles.get(testCase.pickleId) : null;
    const steps = stepStatuses.get(startedId) || [];
    const end = finished.find((f) => f.id === startedId);
    cases.push({
      uri: pickle ? pickle.uri : null,
      scenarioName: pickle ? pickle.name : '(unknown)',
      tags: pickle ? (pickle.tags || []).map((t) => t.name) : [],
      line: null,
      status: worst(steps.map((s) => s.status)),
      durationMs: end ? Math.round(end.at - info.at) : Math.round(steps.reduce((n, s) => n + s.durationMs, 0)),
      steps: steps.length,
      failedStep: (steps.find((s) => s.status === 'failed') || {}).message || null,
      undefinedSteps: steps.filter((s) => s.status === 'undefined').length,
    });
  }
  return cases;
}

function fromLegacyJson(docs) {
  const cases = [];
  for (const feature of docs) {
    const uri = feature.uri || null;
    const featureTags = (feature.tags || []).map((t) => t.name || t);
    for (const el of feature.elements || []) {
      if (el.type && el.type !== 'scenario' && el.type !== 'scenario_outline') continue;
      const steps = (el.steps || []).map((s) => ({
        status: normStatus(s.result && s.result.status),
        message: (s.result && s.result.error_message) || null,
        durationMs: s.result && s.result.duration ? Number(s.result.duration) / 1e6 : 0,
      }));
      cases.push({
        uri,
        scenarioName: el.name || '(unnamed)',
        tags: Array.from(new Set(featureTags.concat((el.tags || []).map((t) => t.name || t)))),
        line: el.line || null,
        status: worst(steps.map((s) => s.status)),
        durationMs: Math.round(steps.reduce((n, s) => n + s.durationMs, 0)),
        steps: steps.length,
        failedStep: (steps.find((s) => s.status === 'failed') || {}).message || null,
        undefinedSteps: steps.filter((s) => s.status === 'undefined').length,
      });
    }
  }
  return cases;
}

function decodeXmlEntities(value) {
  return String(value)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function fromJUnitXml(text) {
  const cases = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[1];
    const body = m[3] || '';
    const attr = (name) => {
      // (?:^|\s) so a query for "name" does not match "classname".
      const a = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*"([^"]*)"').exec(attrs);
      return a ? decodeXmlEntities(a[1]) : null;
    };
    let status = 'passed';
    if (/<failure\b/.test(body) || /<error\b/.test(body)) status = 'failed';
    else if (/<skipped\b/.test(body)) status = 'skipped';
    const seconds = parseFloat(attr('time') || '0');
    cases.push({
      uri: null,
      scenarioName: attr('name') || '(unnamed)',
      tags: [],
      line: null,
      status,
      durationMs: Math.round((Number.isNaN(seconds) ? 0 : seconds) * 1000),
      steps: 0,
      failedStep: status === 'failed' ? (/<failure\b[^>]*message="([^"]*)"/.exec(body) || [])[1] || 'failed' : null,
      undefinedSteps: 0,
      classname: attr('classname'),
    });
  }
  return cases;
}

/** Load and normalize one results file. Returns { format, cases }. */
function loadResultsFile(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return { format: 'empty', cases: [] };
  if (text.startsWith('<')) return { format: 'junit-xml', cases: fromJUnitXml(text) };

  const docs = u.readJsonOrNdjson(file);
  const looksLikeMessages = docs.some((d) => d && (d.testCaseStarted || d.pickle || d.testStepFinished || d.gherkinDocument));
  if (looksLikeMessages) return { format: 'cucumber-messages', cases: fromMessages(docs) };
  const looksLikeLegacy = docs.some((d) => d && Array.isArray(d.elements));
  if (looksLikeLegacy) return { format: 'cucumber-json', cases: fromLegacyJson(docs) };
  return { format: 'unrecognized', cases: [] };
}

function loadResults(files) {
  const all = [];
  const formats = [];
  for (const file of files) {
    if (!fs.existsSync(file)) { formats.push({ file, format: 'missing' }); continue; }
    const { format, cases } = loadResultsFile(file);
    formats.push({ file, format, cases: cases.length });
    all.push(...cases);
  }
  const stats = { total: all.length };
  for (const s of STATUS_ORDER) stats[s] = all.filter((c) => c.status === s).length;
  return { cases: all, sources: formats, stats };
}

module.exports = { loadResults, loadResultsFile, normStatus, worst, STATUS_ORDER };
