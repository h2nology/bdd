---
description: Plan work that has no feature file - infrastructure, a dependency upgrade, tooling, a cleanup - as phases with a verification for each, ready for /bdd:implement to drive.
argument-hint: "<what the work is>"
---

# Plan work with no feature file

Turn a task into a plan on disk: `task_plan.md`, `progress.md` and
`findings.md` under `docs/planning/<YYYY-MM-DD>-<slug>/`, using the **general**
template set.

This command **plans only**. `/bdd:implement` drives the plan afterwards.

Arguments the user gave: `$ARGUMENTS`

## 1. Check the premise first

This template exists for work whose outcome is real but is **not a behaviour**:
standing infrastructure up, moving a pipeline, upgrading a dependency,
restyling a screen without changing what it does, deleting dead code.

Before accepting it, ask the question the template asks:

> Does this task change behaviour a user could observe and a stakeholder could
> sign off on?

If it does, it belongs in a feature file. Say so and point at `discover`, then
`/bdd:plan-with-feature`. Do not open a general plan for behaviour - "it's only
a small change" and "it's just the UI" are the two sentences that most often
smuggle real behaviour past the specification.

Two signals worth checking rather than assuming:

- The task names a screen, a message, a rule, or anything a user would notice.
- The task's success would be described to a non-developer as "now it does X".

Either one means stop and ask.

## 2. Check for an existing plan

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

If something relevant is already open, resume it rather than opening a second.
If something unrelated is open, say so before starting another - two open plans
is a choice, not an accident.

## 3. Build the plan

Follow the `planning` skill, using the **general template set**
(`assets/*-general.md`).

The phases in the template are a starting shape, not a script. Replace them
with this task's real phases - three to seven, each one verifiable.

**Every phase needs a `Verifies` line naming a command, check or observation.**
A phase whose Verifies line reads "looks right" is not a phase: work out what
would actually show it, or merge it into another. This is the whole difference
between a general plan and a to-do list, because there is no failing scenario
here to do that job.

Where verification needs something unavailable in this session - credentials, a
cluster, a device, a human review - say so in the plan now rather than
discovering it at the end.

## 4. Point `.current` at it

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/current-plan.cjs --set docs/planning/<dir>
```

The plan just created is the one `/bdd:implement` should drive, so record that
on disk rather than leaving the next command to work it out. If this moved the
pointer off an **unfinished** plan, name it - that is a decision to put the
other work down, and it should not pass as a line of tool output.

## 5. Report

State, in the user's language: where the plan is, the phases and what verifies
each one, anything already known to be unverifiable here, which plan `.current`
now names, and that `/bdd:implement` drives it from here - pausing after each
phase unless given `--auto`.

Do not start Phase 1 - leave every phase `pending` and `## Next Step` naming
Phase 1, so that `/bdd:implement` is what moves the first one to `in_progress`.
A plan that arrives already `in_progress` claims a phase somebody began before
anybody acted.
