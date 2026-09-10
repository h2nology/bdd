---
name: planning
description: This skill should be used when a piece of work needs a plan on disk before it is built - for example "set up the plan for this feature", "plan this requirement", "what was I working on", "resume the plan", or when a feature file exists but nothing tracks the work of making it pass. Creates and maintains task_plan.md, progress.md and findings.md per plan under docs/planning/, for both feature-driven work (outside-in TDD) and work with no feature file such as infrastructure or a dependency upgrade. It defines and updates the plan; `/bdd:implement` is what drives it.
---

# Define a plan on disk

Write the plan, the evidence and the decisions to disk so the work survives a
lost context, a new session, or a different person.

**This skill defines plans. It does not drive them.** Creating the files,
filling the queues, recording a baseline, moving a phase's status, resuming a
plan after a gap - all of that is here. Actually writing production code
against the plan is `/bdd:implement`.

| You want to | Use |
|---|---|
| Plan a feature file's implementation | `/bdd:plan-with-feature <feature>` |
| Plan work with no feature file | `/bdd:plan <description>` |
| Build against an existing plan | `/bdd:implement` |
| See what the plans say | `/bdd:status` |

## Communication policy

The line is drawn at **who reads it**, not who wrote it.

- **Planning prose follows the user's language.** Goals, phase titles, the next
  step, questions, decisions and findings are written in the language the team
  speaks. These files are read by the people doing the work.
- **Structure stays English.** Headings, field names, status values - phases
  (`pending`, `in_progress`, `complete`), scenarios (`undefined`, `red`,
  `blocked`, `green`) and capabilities (`todo`, `in_progress`, `done`) - tags,
  file and directory names, commands, and pasted tool output. The status script
  parses them, so they must not shift with the prose.
- **Code and commits stay English.**
- **Talk to the user in the language they use.**

## Where the files live

```
docs/planning/
  2026-09-08-checkout/          <- features/checkout.feature
    task_plan.md
    progress.md
    findings.md
  2026-09-09-terraform-vpc/     <- no feature; a general task
    task_plan.md
    progress.md
    findings.md
```

One directory per plan, named `<YYYY-MM-DD>-<slug>`. The slug comes from the
feature file's basename, or from the task if there is no feature. The date is
the day the plan was opened and never changes afterwards.

Committed, not ignored. `bdd-artifacts/` holds generated reports and is
throwaway; this is the record of how the code came to exist, and it belongs in
the repository next to it.

**A second round on the same feature gets a new dated directory.** Do not
reopen a finished plan when the feature grows - the old one is the record of
what was true then.

## 1. Look before creating

Always:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

| What it shows | What to do |
|---|---|
| A plan `in_progress` for what the user asked | Resume it - read all three files, then `git diff --stat` for code they may not know about. |
| A plan `in_progress` for something else | Say so before starting a second one. Two open plans is a choice, not an accident. |
| A drift warning on a plan | Stop. See **Drift** below. |
| Nothing relevant | Create a plan. |

## 2. Pick the template set, and be honest about it

| The work | Template set |
|---|---|
| A feature file's scenarios have to pass | `assets/*-bdd.md` |
| Real work with no observable behaviour to sign off | `assets/*-general.md` |

If the task changes behaviour a user could observe and a stakeholder could sign
off, it needs a feature file. Say so and use `discover` first, rather than
opening a general plan and building it untested. "It's only a small change" is
how behaviour gets past the specification.

```bash
mkdir -p docs/planning/$(date +%Y-%m-%d)-<slug>
```

Copy all three files of the chosen set into it, dropping the suffix:
`task_plan-<set>.md` becomes `task_plan.md`, and the same for `progress.md` and
`findings.md`.

**Never mix the two sets.** A BDD plan with a general `progress.md` has nowhere
to record the RED evidence, and a general plan with a BDD `findings.md` asks
its author about scenarios that do not exist.

## 3. Fill the Source table

For a BDD plan, the feature path and its fingerprint:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs --fingerprint features/<name>.feature
```

Translate the prose into the user's language as you fill it in. Leave a
placeholder unfilled rather than inventing a value for it.

## 4. BDD plans only: Phase 0 - harness, commands, design system, baseline

A BDD plan cannot be written without this: the Scenario Queue's initial state
has to be **observed**, not guessed, and the six commands have to be real.
This is the last thing the planning skill does; Phase 1 onward is
`/bdd:implement`.

**Harness.** Run the suite. If it cannot execute at all, stop and use
`bdd-setup`. A missing harness is not something to work around one capability at
a time.

**Design system.** If any scenario in the feature is tagged `@web`, record which
design system the plan builds against - the detection rules are in
`${CLAUDE_PLUGIN_ROOT}/skills/design-system-setup/references/design-sources.md`.
If the project has none, stop and use `design-system-setup`, for the same reason
as a missing harness: it is not something to work around one capability at a
time, and unlike a missing harness nothing downstream will complain. Scenarios
assert behaviour, so they go green on a page nobody could use. A feature that
renders no UI needs none - record that it is why, rather than leaving the row
blank.

**Commands.** Resolve the six placeholders and write them into the plan's
Phase 0 table. They differ per stack - this plugin supports TypeScript, Java,
Python and .NET, so nothing may assume `npm`:

| Placeholder | What it has to do |
|---|---|
| `<cucumber>` | run the whole suite |
| `<cucumber-one>` | run one scenario, selected by tag |
| `<cucumber-feature>` | run every scenario in one feature |
| `<unit-test>` | run the unit tests |
| `<unit-test-one>` | run one unit test file or test name |
| `<coverage>` | regenerate the requirement coverage report |

**Confirm `<cucumber-feature>` actually filters, by counting the scenarios it
runs.** A runner config that pins the feature glob makes the runner ignore a
path given on the command line and run the whole suite instead, silently -
cucumber-js does exactly this when `cucumber.mjs` sets `paths`. Drop that key
(the `bdd-setup` skill's TypeScript reference explains it) and the path argument
works. The honest way to confirm it is to make the two counts differ: with only
one feature file in the project they are identical either way, so add a
throwaway second feature, check the counts, and delete it. If the key cannot be
dropped, a union of the feature's requirement tags is the fallback, and then say
in the plan that **the command is coupled to the feature's scenario list**:
adding a scenario without updating it under-tests the feature and nothing
complains.

If the project has **no unit test framework at all**, `<unit-test>` cannot be
resolved by inspection. Say so, agree one with the user, and record in
`progress.md` that it was introduced here rather than found. Note where its
tests will live - see `${CLAUDE_PLUGIN_ROOT}/references/test-layout.md`,
which this plugin requires to be a directory separate from the production code.

`skills/run/SKILL.md` has the per-stack invocations. Do not guess them; read
the project's own config and confirm each one runs before recording it.

**Baseline.** List the feature's scenarios, then run the suite once and record
what is already true:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs features/<name>.feature --json bdd-artifacts/spec.json
```

Fill the Scenario Queue from the JSON, and set each row's state from the run,
not from expectation. Some scenarios may already be `green` - a feature is
often partly built. Paste the run summary into `progress.md`.

## Moving a phase

Two transitions, and the timing of each matters:

| Transition | When |
|---|---|
| `pending` -> `in_progress` | **Before** the first action of that phase. |
| `in_progress` -> `complete` | **After** every one of its checks was observed, **and after** the evidence is written into `progress.md`. |

The order in the second row is the point. Write the evidence, then mark it
complete. Reversed, "complete" becomes a statement of intent that the evidence
is expected to catch up with - which is the exact failure these files exist to
prevent, and nobody can tell afterwards which way round it happened.

Set it with the script rather than editing the markdown:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/phase-status.cjs 3.2 complete --plan docs/planning/<dir>
```

A capability's phase is addressed by its sub-number - `3.2`, not `3`. Asking
for `3` moves the parent Phase 3 status and leaves every capability alone;
asking for `3.2` moves that one capability and nothing else. The difference is
silent, so read the confirmation line the script prints rather than assuming.

It rejects a status outside `pending|in_progress|complete`, rejects a phase
number the plan does not have, holds a lock so two runs cannot interleave, and
replaces the file atomically. Hand-editing is how a typo, a wrong phase or an
invented status value gets in - and `planning-status.cjs` matches on these
exact literals, so a plan with `done` in it reports as if that phase were never
started.

**Then rewrite `## Next Step` in the same pass.** The script says so too. A
plan whose next step still describes finished work cannot be resumed; whoever
picks it up has to re-read everything to find out where it actually is.

## The checkboxes are the phase's real content

Each phase lists its checks as `- [ ]`. Tick each one to `- [x]` **as it is
observed**, one at a time, while the phase is `in_progress` - not in a batch
when the status changes. The reason is the same one that orders the status
transitions: a run of boxes ticked together at the end records an intention,
and nobody can tell afterwards whether each check actually happened.

Ticking as you go also makes a half-finished phase readable. `in_progress`
with four of six ticked says which check is next; `in_progress` with none says
only that somebody started.

`complete` means every box in that phase is ticked. A `complete` phase with an
open box is a contradiction, and it is worth stopping over rather than tidying
up: either the check was never made - so the phase is not complete and the
status is wrong - or it was made and never written down, in which case the plan
is claiming an observation it cannot show. Both are the failure these files
exist to catch, and the second is the dangerous one, because it looks like
bookkeeping.

The script does not touch the boxes. It writes the `**Status:**` line and
nothing else, deliberately: whether a check was observed is a judgement, and a
tool that ticked them on your behalf would be asserting something it never
saw. `planning-status.cjs` does read them, and reports either contradiction -
a `complete` phase with an open box, or a `pending` one with a box already
ticked - as a warning it leaves for you to settle.

Nothing advances a status automatically, and nothing should. When the session
ends, a `Stop` hook runs `planning-status.cjs --warnings-only`: it reports
drifted, stalled, blocked and self-contradicting plans - including a phase
whose status and checkboxes disagree - and stays silent otherwise. It reports;
it never edits, and it never blocks the stop.

## Resuming a plan

Read all three files **before** doing anything else, then run `git diff --stat`
to see code the files may not know about yet. `progress.md` has a **Reboot
check** table for exactly this.

Resuming is not re-planning. If the plan is still accurate, hand over to
`/bdd:implement`. Rewrite the plan only when the work itself changed shape, and
say what changed.

## Drift

A BDD plan records the feature file's fingerprint. When it no longer matches,
the specification moved after the plan was made.

Stop and say so. Do not diff-and-guess which scenarios changed, and do not
carry on against the old queue. Ask which it is:

- The feature genuinely moved on - close this plan, note why in its
  `findings.md`, and open a new dated plan against the new feature.
- The change was incidental (a typo, a reworded description) - confirm that
  with the user, then re-fingerprint and continue.

## What goes in which file

| `task_plan.md` | `progress.md` | `findings.md` |
|---|---|---|
| Where the loop is now | What was actually run, and what it printed | What was learned and decided |
| The capability or phase in hand | Every capability's history | Technical decisions, with reasons |
| Blocking questions | Errors, attempts, resolutions | Answered questions |

Two rules about `progress.md` that the templates cannot enforce:

- **Never write `PASS` for something that was not executed.** A scenario that
  was never run is not green, however obviously correct the code looks.
- **Quote real output.** This file is the only thing that still proves the work
  after the context is gone and the commits are squashed.

## Reference files

| File | What it is for |
|---|---|
| `assets/task_plan-bdd.md` | The feature-wide loop, one `Phase 3.x` per capability |
| `assets/progress-bdd.md` | What was run per capability, and what it printed |
| `assets/findings-bdd.md` | Decisions, and the specification problems implementing exposed |
| `assets/task_plan-general.md` | Phase plan for work with no feature file |
| `assets/progress-general.md` | What was run per phase, and what it printed |
| `assets/findings-general.md` | Decisions, and where reality differed from what was assumed |
| `${CLAUDE_PLUGIN_ROOT}/references/test-layout.md` | Where unit tests go, per stack - and why never beside the code |

| Script | What it is for |
|---|---|
| `scripts/planning-status.cjs` | Read the plans: what is in progress, what needs attention |
| `scripts/phase-status.cjs` | Write one phase's status, safely |
