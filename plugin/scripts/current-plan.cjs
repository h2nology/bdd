#!/usr/bin/env node
'use strict';
/**
 * Read and move the pointer that says which plan is being driven right now.
 *
 * Usage:
 *   node current-plan.cjs                   print the current plan's directory
 *   node current-plan.cjs --set <dir>       point at that plan
 *   node current-plan.cjs --clear           remove the pointer
 *
 * Options:
 *   --root <dir>   Planning root (default docs/planning)
 *   --quiet        Print the resolved directory and nothing else, for scripting
 *
 * Why this exists. One project grows one plan per feature, so "the open plan"
 * stops identifying anything: `/bdd:implement` with no argument had to guess,
 * and `phase-status.cjs` simply refused and asked for `--plan` every time. The
 * pointer answers that question once, on disk, where the next session can read
 * it.
 *
 * What it deliberately does not do is decide anything. Which plan is current is
 * the user's call; this only records it, checks that the target is a real plan,
 * and fails loudly when the pointer no longer resolves. A dangling pointer is
 * reported, never quietly repaired - the two ways it happens (the plan was
 * renamed, or it was deleted) need opposite fixes, and the file cannot say
 * which.
 *
 * Exit codes, so callers can tell the three states apart:
 *   0  a pointer is set and resolves to a plan
 *   1  bad usage, or --set given a directory that is not a plan
 *   3  no pointer is set
 *   4  a pointer is set but does not resolve - dangling
 */

const fs = require('fs');
const path = require('path');
const u = require('./lib/util.cjs');

const DEFAULT_ROOT = path.join('docs', 'planning');
const LOCK_TIMEOUT_MS = 5000;

const HEADER = [
  '# Which plan /bdd:implement drives when no plan is named.',
  '# One line: the plan directory, relative to this file. Written by',
  '# current-plan.cjs - see the planning skill for the rules around it.',
];

function fail(message, code) {
  process.stderr.write('[current-plan] ' + message + '\n');
  process.exit(code === undefined ? 1 : code);
}

// Reading and resolving the pointer live in util.cjs, because planning-status
// and phase-status read it too and three copies of "what counts as a plan" is
// three chances for them to disagree about it.
const { readPlanPointer, resolvePlanPointer } = u;

function pointerFile(root) {
  return path.join(root, u.POINTER_FILE);
}

/** A plan directory is one holding a task_plan.md. Nothing else counts. */
function isPlanDir(dir) {
  return fs.existsSync(path.join(dir, 'task_plan.md'));
}

/** Hold a lock at the root, so two sessions cannot interleave a write. */
function withLock(root, work) {
  const lockDir = path.join(root, '.bdd-locks', 'current-plan.lock');
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

function writePointer(root, planDir) {
  const file = pointerFile(root);
  // Store the name when the plan sits directly under the root - that is what a
  // reader of the committed file wants to see, and it survives the repository
  // being checked out somewhere else.
  const relative = path.relative(root, planDir);
  const value = relative && !relative.startsWith('..') ? relative : planDir;
  withLock(root, () => {
    const tmp = file + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, HEADER.join('\n') + '\n' + value + '\n');
    fs.renameSync(tmp, file);
  });
  return value;
}

function doSet(root, target) {
  const dir = path.normalize(target);
  if (!fs.existsSync(dir)) fail('no such directory: ' + dir);
  if (!isPlanDir(dir)) {
    fail('not a plan: ' + dir + ' has no task_plan.md.\n'
      + 'Create the plan first with /bdd:plan-with-feature or /bdd:plan.');
  }
  const previous = readPlanPointer(root);
  const value = writePointer(root, dir);
  if (previous === value) {
    process.stdout.write('current plan: ' + value + ' (unchanged)\n');
  } else {
    process.stdout.write('current plan: ' + (previous || '(none)') + ' -> ' + value
      + '  in ' + pointerFile(root) + '\n');
  }
}

function doClear(root) {
  const file = pointerFile(root);
  if (!fs.existsSync(file)) {
    process.stdout.write('no current plan was set.\n');
    return;
  }
  const previous = readPlanPointer(root);
  withLock(root, () => fs.unlinkSync(file));
  process.stdout.write('cleared current plan (was ' + (previous || '(blank)') + ').\n');
}

function doRead(root, quiet) {
  const value = readPlanPointer(root);
  if (!value) {
    if (!quiet) {
      process.stdout.write('No current plan set in ' + pointerFile(root) + '.\n'
        + 'Set one with: current-plan.cjs --set docs/planning/<dir>\n');
    }
    process.exit(3);
  }
  const dir = resolvePlanPointer(root, value);
  if (!dir) {
    // Dangling. Renamed and deleted need opposite fixes and the file cannot say
    // which, so this stops rather than picking the nearest match.
    process.stderr.write('[current-plan] ' + pointerFile(root) + ' points at "'
      + value + '", which is not a plan.\n'
      + 'It was renamed, or it was deleted. Settle which, then --set or --clear.\n');
    process.exit(4);
  }
  process.stdout.write(dir + '\n');
}

function main() {
  const opts = u.parseArgs(process.argv.slice(2));
  const root = typeof opts.root === 'string' ? opts.root : DEFAULT_ROOT;

  if (opts.set !== undefined && opts.clear !== undefined) {
    fail('--set and --clear are opposites; pass one.');
  }
  if (opts.clear !== undefined) return doClear(root);
  if (opts.set !== undefined) {
    if (typeof opts.set !== 'string') fail('--set needs a plan directory.');
    return doSet(root, opts.set);
  }
  if (opts._.length) {
    fail('unexpected argument "' + opts._[0] + '".\n'
      + 'usage: current-plan.cjs [--set <dir> | --clear] [--root <dir>] [--quiet]');
  }
  return doRead(root, opts.quiet === true);
}

main();
