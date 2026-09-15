#!/usr/bin/env node
'use strict';
/**
 * Set one phase's status in a plan's task_plan.md.
 *
 * Usage:
 *   node phase-status.cjs <phase> <pending|in_progress|complete> [options]
 *
 * <phase> is a phase number, or a sub-phase like `4.2` for one capability's
 * coding phase.
 *
 * Options:
 *   --plan <dir>   The plan directory. Defaults to the plan `.current` names,
 *                  and falls back to the only open plan when no pointer is set.
 *   --root <dir>   Planning root to search (default docs/planning)
 *
 * The only sanctioned writer of a `**Status:**` line. Editing the markdown by
 * hand is what puts a typo, a wrong phase or an invented status value into the
 * file - and every one of those makes planning-status.cjs quietly misreport the
 * plan, because it matches on these exact literals.
 *
 * What this does NOT decide is whether the phase is actually done. That is a
 * judgement about evidence, and it belongs to whoever is doing the work. This
 * script only makes their decision land safely: the value is checked against
 * the allowlist, the phase must exist, the write is serialized behind a
 * directory lock, and it lands as an atomic rename so an interrupted run can
 * never leave half a plan on disk.
 */

const fs = require('fs');
const path = require('path');
const u = require('./lib/util.cjs');

const DEFAULT_ROOT = path.join('docs', 'planning');
const STATUSES = ['pending', 'in_progress', 'complete'];
const LOCK_TIMEOUT_MS = 5000;

function fail(message) {
  process.stderr.write('[phase-status] ' + message + '\n');
  process.exit(1);
}

/** Plans under root that still have an unfinished phase. */
function openPlans(root) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => path.join(root, e.name))
    .filter((dir) => {
      const file = path.join(dir, 'task_plan.md');
      if (!fs.existsSync(file)) return false;
      return /\*\*Status:\*\*\s*`?(pending|in_progress)`?/.test(fs.readFileSync(file, 'utf8'));
    });
}

/** Hold a directory lock next to the plan, or give up rather than race. */
function withLock(planDir, work) {
  const lockDir = path.join(planDir, '.bdd-locks', 'phase-status.lock');
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  const startedAt = Date.now();
  for (;;) {
    try { fs.mkdirSync(lockDir); break; } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        fail('timed out waiting for ' + lockDir + '. Nothing was written.\n'
          + 'If no other run is active, remove that directory and try again.');
      }
      // Node 14 has no sleep; spin briefly rather than pull in a dependency.
      const until = Date.now() + 50;
      while (Date.now() < until);
    }
  }
  try { return work(); } finally {
    try { fs.rmdirSync(lockDir); } catch { /* already gone */ }
  }
}

/**
 * Rewrite the first `**Status:**` line after the `### Phase <n>` heading.
 * Returns the new text, or null when the phase or its status line is missing.
 *
 * `<n>` may be a sub-phase like `4.2` - the capability phases expand under
 * Phase 4, one per capability. The lookahead is what keeps them apart: asking
 * for `4` must not match `### Phase 4.2`, or the first capability would absorb
 * every status write meant for the parent. The dot is escaped because the
 * number lands inside a regex.
 */
function rewrite(md, phase, status) {
  const lines = md.split('\n');
  // A plan quotes phase blocks as examples - the BDD template's Phase 4 block,
  // shown so Phase 3 can copy it per capability. Those lines are a picture of a
  // phase, not one: writing a status into a fenced example changes nothing the
  // plan tracks, and the phase the user asked about stays as it was.
  const fenced = u.fencedLines(lines);
  const heading = new RegExp('^#{3,4}\\s+Phase\\s+'
    + phase.replace(/\./g, '\\.') + '(?![0-9.])');
  let inBlock = false;
  let changed = false;
  let previous = '';

  for (let i = 0; i < lines.length; i += 1) {
    if (fenced[i]) continue;
    const line = lines[i];
    if (/^#{3,4}\s+Phase\s/.test(line)) { inBlock = !changed && heading.test(line); continue; }
    if (!inBlock || changed) continue;
    const match = line.match(/^(\s*(?:[-*]\s*)?\*\*Status:\*\*\s*)(.*)$/);
    if (!match) continue;
    previous = match[2].trim();
    // Keep whatever quoting the file already uses, so the diff is one word.
    const value = /^`.*`$/.test(previous) ? '`' + status + '`' : status;
    lines[i] = match[1] + value;
    inBlock = false;
    changed = true;
  }
  return changed ? { text: lines.join('\n'), previous: previous.replace(/`/g, '') } : null;
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));
  const [phase, status] = opts._;

  if (!phase || !status) {
    fail('usage: phase-status.cjs <phase|phase.sub> <' + STATUSES.join('|') + '> [--plan <dir>]');
  }
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(phase)) {
    fail('phase must be a number, or a sub-phase like 4.2, got "' + phase + '"');
  }
  if (STATUSES.indexOf(status) === -1) {
    fail('invalid status "' + status + '". Allowed: ' + STATUSES.join(', ') + '.');
  }

  const root = typeof opts.root === 'string' ? opts.root : DEFAULT_ROOT;
  let planDir = typeof opts.plan === 'string' ? opts.plan : '';

  if (!planDir) {
    // The `.current` pointer answers "which plan" before guessing has to. It
    // wins over "there is only one open plan" because it is a statement someone
    // made, and it keeps holding the moment a second plan opens - which is the
    // point at which this script used to start refusing to run at all.
    const pointed = u.readPlanPointer(root);
    if (pointed) {
      planDir = u.resolvePlanPointer(root, pointed);
      if (!planDir) {
        fail('the current plan "' + pointed + '" in ' + path.join(root, u.POINTER_FILE)
          + ' is not a plan.\nIt was renamed or deleted - settle which with '
          + 'current-plan.cjs --set or --clear, or name one here with --plan.');
      }
    } else {
      const open = openPlans(root);
      if (open.length === 0) fail('no open plan under ' + root + '. Name one with --plan.');
      if (open.length > 1) {
        fail('more than one plan is open and none is marked current - either set '
          + 'the pointer:\n  current-plan.cjs --set ' + open[0]
          + '\nor name one here:\n  ' + open.map((d) => '--plan ' + d).join('\n  '));
      }
      planDir = open[0];
    }
  }

  const planFile = path.join(planDir, 'task_plan.md');
  if (!fs.existsSync(planFile)) fail('no task_plan.md in ' + planDir);

  const result = withLock(planDir, () => {
    const md = fs.readFileSync(planFile, 'utf8');
    const next = rewrite(md, phase, status);
    if (!next) return null;
    const tmp = planFile + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, next.text);
    fs.renameSync(tmp, planFile);
    return next;
  });

  if (!result) {
    fail('Phase ' + phase + ' has no **Status:** line in ' + planFile
      + '.\nCheck the phase number against the plan.');
  }

  process.stdout.write('Phase ' + phase + ': ' + (result.previous || '(blank)')
    + ' -> ' + status + '  in ' + planFile + '\n');
  if (status === 'complete' || status === 'in_progress') {
    process.stdout.write('Now update `## Next Step` in the same file - a plan '
      + 'whose next step still describes finished work cannot be resumed.\n');
  }
}

main();
