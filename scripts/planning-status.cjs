#!/usr/bin/env node
'use strict';
/**
 * Status of the planning files the `implement` skill keeps on disk.
 *
 * Usage:
 *   node planning-status.cjs [options]
 *   node planning-status.cjs --fingerprint <feature-file>
 *
 * Options:
 *   --root <dir>        Planning root (default docs/planning)
 *   --plan <dir>        Report one plan in full instead of the summary
 *   --json <file>       Also write the structured model as JSON
 *   --stale-days <n>    Warn when an in_progress plan has not moved (default 14)
 *   --warnings-only     Print only the plans that need attention, and nothing
 *                       at all when none do. For hooks, where silence is the
 *                       normal case and noise gets the hook switched off.
 *   --strict            Exit 1 when any warning was raised, for CI
 *   --fingerprint <f>   Print the sha256 of one file and exit; nothing else runs
 *
 * Reads only. It never edits a plan - the numbers here are observations, and a
 * plan that disagrees with them is the finding, not a thing to quietly correct.
 * That includes the phase checkboxes: a `complete` phase with an open box, or a
 * `pending` one with a ticked box, is reported and left alone.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const u = require('./lib/util.cjs');

const DEFAULT_ROOT = path.join('docs', 'planning');
const PHASE_RE = /^#{3,4}\s+Phase\s+([0-9]+)\s*[:.]?\s*(.*)$/;
const CHECKBOX_RE = /^\s*- \[( |x|X)\]/;
/** A level-2 heading ends the phase it followed, so trailing prose is not counted into it. */
const SECTION_RE = /^##\s+(?!#)/;
const STATUS_RE = /^\s*[-*]?\s*\*\*Status:\*\*\s*(.+?)\s*$/;
const STATES = new Set(['undefined', 'red', 'green']);
const PHASE_STATES = new Set(['pending', 'in_progress', 'complete']);

/** Strip markdown emphasis and code ticks from a table cell or field value. */
function clean(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/`/g, '').replace(/\*\*/g, '').trim();
}

/** A value still holding its template placeholder, e.g. `<YYYY-MM-DD>`. */
function isPlaceholder(value) {
  const v = clean(value);
  return !v || /^<.*>$/.test(v);
}

function fingerprintOf(file) {
  return 'sha256:' + crypto.createHash('sha256')
    .update(fs.readFileSync(file)).digest('hex');
}

/** Body of one `## Heading` section, up to the next heading of the same level. */
function section(md, heading) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === '## ' + heading.toLowerCase());
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** First paragraph of a section that is not an HTML comment or a table. */
function firstProse(body) {
  for (const raw of body.split(/\n\s*\n/)) {
    const block = raw.trim();
    if (!block || block.startsWith('<!--') || block.startsWith('|')) continue;
    return block.split(/\r?\n/).map((l) => l.trim()).join(' ');
  }
  return '';
}

/** A section's first prose paragraph, cleaned - or '' when still a placeholder. */
function prose(md, heading) {
  const value = clean(firstProse(section(md, heading)));
  return isPlaceholder(value) ? '' : value;
}

/** Rows of the first pipe table in a section, as arrays of cells. */
function firstTable(body) {
  const rows = [];
  let seen = false;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) { if (seen) break; continue; }
    seen = true;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;
    rows.push(trimmed.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  }
  return rows;
}

/** The `## Source` table, as a lowercased field map. */
function parseSource(md) {
  const out = {};
  for (const cells of firstTable(section(md, 'Source'))) {
    if (cells.length < 2) continue;
    const key = clean(cells[0]).toLowerCase();
    if (key === 'field') continue;
    out[key] = clean(cells[1]);
  }
  return out;
}

function parseQueue(md) {
  const rows = [];
  for (const cells of firstTable(section(md, 'Scenario Queue'))) {
    if (cells.length < 4) continue;
    const tag = clean(cells[1]);
    if (tag.toLowerCase() === 'tag') continue;
    const state = clean(cells[3]).toLowerCase();
    rows.push({
      tag,
      name: clean(cells[2]),
      state: STATES.has(state) ? state : 'unknown',
      placeholder: isPlaceholder(cells[1]) || isPlaceholder(cells[2]),
    });
  }
  return rows;
}

function parsePhases(md) {
  const phases = [];
  let current = null;
  for (const line of md.split(/\r?\n/)) {
    const head = line.match(PHASE_RE);
    if (head) {
      current = { number: Number(head[1]), title: clean(head[2]), status: '', checked: 0, open: 0 };
      phases.push(current);
      continue;
    }
    if (!current) continue;
    // `## Key Questions` and friends follow the last phase; their bullets are
    // not that phase's checks.
    if (SECTION_RE.test(line)) { current = null; continue; }
    const box = line.match(CHECKBOX_RE);
    if (box) {
      if (box[1] === ' ') current.open += 1;
      else current.checked += 1;
      continue;
    }
    if (current.status) continue;
    const status = line.match(STATUS_RE);
    if (status) {
      const value = clean(status[1]).toLowerCase();
      current.status = PHASE_STATES.has(value) ? value : 'unknown';
    }
  }
  return phases;
}

/** The phase the work is actually in: the first that is not complete. */
function activePhase(phases) {
  return phases.find((p) => p.status === 'in_progress')
    || phases.find((p) => p.status === 'pending')
    || null;
}

/** Non-empty, non-placeholder bullets of a section. */
function bullets(body) {
  return body.split(/\r?\n/)
    .filter((l) => /^\s*[-*]\s+/.test(l) || /^\s*[0-9]+\.\s+/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*]|[0-9]+\.)\s+/, '').trim())
    .filter((l) => l && !isPlaceholder(l));
}

function mtimeOf(file) {
  try { return fs.statSync(file).mtime; } catch { return null; }
}

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function readPlan(dir) {
  const planFile = path.join(dir, 'task_plan.md');
  if (!fs.existsSync(planFile)) return null;
  const md = fs.readFileSync(planFile, 'utf8');
  const source = parseSource(md);
  const feature = source.feature && !/^\(none\)$/i.test(source.feature) ? source.feature : '';
  const phases = parsePhases(md);
  const queue = parseQueue(md).filter((r) => !r.placeholder);

  return {
    dir,
    name: path.basename(dir),
    kind: feature ? 'feature' : 'general',
    feature,
    fingerprint: isPlaceholder(source.fingerprint) ? '' : source.fingerprint,
    started: isPlaceholder(source.started) ? '' : source.started,
    label: feature ? path.basename(feature) : (isPlaceholder(source.kind) ? '' : source.kind),
    goal: prose(md, 'Goal'),
    nextStep: prose(md, 'Next Step'),
    currentScenario: prose(md, 'Current Scenario'),
    phases,
    activePhase: activePhase(phases),
    complete: phases.length > 0 && phases.every((p) => p.status === 'complete'),
    queue,
    blocked: bullets(section(md, 'Blocked On')),
    questions: bullets(section(md, 'Key Questions')),
    hasProgress: fs.existsSync(path.join(dir, 'progress.md')),
    hasFindings: fs.existsSync(path.join(dir, 'findings.md')),
    touched: mtimeOf(path.join(dir, 'progress.md')) || mtimeOf(planFile),
  };
}

function checkPlan(plan, staleDays) {
  const warnings = [];
  if (plan.feature) {
    if (!fs.existsSync(plan.feature)) {
      warnings.push('feature file is gone: ' + plan.feature);
    } else if (!plan.fingerprint) {
      warnings.push('no fingerprint recorded - drift cannot be detected');
    } else if (fingerprintOf(plan.feature) !== plan.fingerprint) {
      warnings.push('the feature file changed since this plan was made - do not '
        + 'guess which scenarios moved; settle it before continuing');
    }
  }
  if (!plan.hasProgress) warnings.push('progress.md is missing');
  if (!plan.hasFindings) warnings.push('findings.md is missing');
  if (plan.blocked.length) warnings.push('blocked on: ' + plan.blocked.join('; '));
  if (!plan.complete) {
    const idle = daysSince(plan.touched);
    if (idle !== null && idle >= staleDays) {
      warnings.push('nothing recorded for ' + idle + ' days');
    }
    if (!plan.nextStep) warnings.push('no next step recorded');
  }
  if (plan.complete && plan.queue.some((r) => r.state !== 'green')) {
    warnings.push('every phase is complete but not every scenario is green');
  }
  // A phase's checks are its real content. `complete` over an open box means
  // either the check was never made - so the status is wrong - or it was made
  // and never written down, and the plan is claiming an observation it cannot
  // show. Ticked boxes under `pending` are the same contradiction inverted.
  for (const phase of plan.phases) {
    if (phase.status === 'complete' && phase.open > 0) {
      warnings.push('Phase ' + phase.number + ' is complete with ' + phase.open
        + ' unticked check' + (phase.open === 1 ? '' : 's')
        + ' - either it was not made, or it was not written down');
    }
    if (phase.status === 'pending' && phase.checked > 0) {
      warnings.push('Phase ' + phase.number + ' is pending but ' + phase.checked
        + ' check' + (phase.checked === 1 ? ' is' : 's are')
        + ' already ticked - move it to in_progress');
    }
  }
  return warnings;
}

function findPlans(root) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => readPlan(path.join(root, e.name)))
    .filter(Boolean)
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

function queueSummary(queue) {
  if (!queue.length) return '';
  const count = (state) => queue.filter((r) => r.state === state).length;
  const parts = [count('green') + '/' + queue.length + ' green'];
  for (const state of ['red', 'undefined', 'unknown']) {
    if (count(state)) parts.push(count(state) + ' ' + state);
  }
  return parts.join(', ');
}

function phaseLine(plan) {
  if (plan.complete) return 'all phases complete';
  const phase = plan.activePhase;
  if (!phase) return 'no phases recorded';
  return 'Phase ' + phase.number + ': ' + phase.title + ' (' + phase.status + ')';
}

function field(label, value) {
  return value ? '    ' + label.padEnd(9) + value + '\n' : '';
}

function renderPlan(plan, warnings, verbose) {
  const mark = warnings.length ? '! ' : '  ';
  let out = mark + plan.name + '  [' + plan.kind + (plan.label ? ' ' + plan.label : '') + ']\n';
  out += field('phase', phaseLine(plan));
  if (plan.currentScenario) out += field('scenario', plan.currentScenario);
  if (plan.queue.length) out += field('queue', queueSummary(plan.queue));
  out += field('next', plan.nextStep);
  const idle = daysSince(plan.touched);
  if (idle !== null) out += field('touched', idle === 0 ? 'today' : idle + ' days ago');
  if (verbose) {
    if (plan.goal) out += field('goal', plan.goal);
    for (const q of plan.questions) out += field('question', q);
    for (const row of plan.queue) {
      out += '      ' + row.state.padEnd(10) + row.tag + ' ' + row.name + '\n';
    }
  }
  for (const w of warnings) out += '    ' + 'warning'.padEnd(9) + w + '\n';
  return out;
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));

  if (typeof opts.fingerprint === 'string') {
    if (!fs.existsSync(opts.fingerprint)) {
      process.stderr.write('not found: ' + opts.fingerprint + '\n');
      process.exit(2);
    }
    process.stdout.write(fingerprintOf(opts.fingerprint) + '\n');
    return;
  }

  const staleDays = Number(opts.staleDays) > 0 ? Number(opts.staleDays) : 14;
  const root = typeof opts.root === 'string' ? opts.root : DEFAULT_ROOT;
  const single = typeof opts.plan === 'string';
  const plans = single ? [readPlan(opts.plan)].filter(Boolean) : findPlans(root);

  if (single && !plans.length) {
    process.stderr.write('no task_plan.md in ' + opts.plan + '\n');
    process.exit(2);
  }

  if (!plans.length) {
    if (!opts.warningsOnly) {
      process.stdout.write('No plans under ' + root + '.\n'
        + 'The implement skill creates one per feature; nothing has been started yet.\n');
    }
    return;
  }

  const reports = plans.map((plan) => ({ plan, warnings: checkPlan(plan, staleDays) }));
  const open = reports.filter((r) => !r.plan.complete);
  const warned = reports.filter((r) => r.warnings.length);

  if (opts.warningsOnly && !warned.length) return;

  const shown = opts.warningsOnly ? warned : reports;
  let out = (single ? '' : root + ' - ' + reports.length + ' plan'
    + (reports.length === 1 ? '' : 's') + ', ' + open.length + ' open\n\n');
  for (const r of shown) out += renderPlan(r.plan, r.warnings, single) + '\n';
  if (warned.length) {
    out += warned.length + (warned.length === 1 ? ' plan needs' : ' plans need')
      + ' attention - marked ! above.\n';
  }
  process.stdout.write(out);

  if (opts.json) {
    u.writeFileEnsured(String(opts.json), JSON.stringify(
      reports.map((r) => Object.assign({}, r.plan, {
        touched: r.plan.touched ? r.plan.touched.toISOString() : null,
        warnings: r.warnings,
      })), null, 2));
  }

  if (opts.strict && warned.length) process.exit(1);
}

main();
