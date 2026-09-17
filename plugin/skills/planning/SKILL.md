---
name: planning
description: This skill should be used when a piece of work needs a plan on disk before it is built - for example "set up the plan for this feature", "plan this requirement", "what was I working on", "resume the plan", or when a feature file exists but nothing tracks the work of making it pass. Creates and maintains task_plan.md, progress.md and findings.md per plan under docs/planning/, for both feature-driven work (outside-in TDD) and work with no feature file such as infrastructure or a dependency upgrade. It defines and updates the plan; `/bdd:implement` is what drives it.
user-invocable: false
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
  .current                      <- which plan is being driven right now
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
the repository next to it. `.current` is committed with the rest.

**A second round on the same feature gets a new dated directory.** Do not
reopen a finished plan when the feature grows - the old one is the record of
what was true then.

## `.current` - which plan is being driven

A project with several feature files grows several plans, and then "the open
plan" stops identifying anything. `.current` names the one being driven now:

```
# Which plan /bdd:implement drives when no plan is named.
# One line: the plan directory, relative to this file. Written by
# current-plan.cjs - see the planning skill for the rules around it.
2026-09-08-checkout
```

**Never hand-edit it**, for the same reason `**Status:**` lines are written by
`phase-status.cjs`. The script checks the target is a real plan before pointing
at it, so a typo fails loudly here rather than surfacing later as a plan nobody
can find.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/current-plan.cjs                  # read it
node ${CLAUDE_PLUGIN_ROOT}/scripts/current-plan.cjs --set docs/planning/<dir>
node ${CLAUDE_PLUGIN_ROOT}/scripts/current-plan.cjs --clear
```

Its exit codes separate the three states a caller has to tell apart: `0` set and
resolves, `3` not set, `4` set but dangling.

### The rules

| When | What happens to the pointer |
|---|---|
| A plan is created (`/bdd:plan-with-feature`, `/bdd:plan`) | Point at the new plan, and say so. |
| `/bdd:implement` is given a plan directory | Drive that one, **and move the pointer to it**. The pointer states what is being driven; a run that drove something else would leave it lying. |
| `/bdd:implement` is given nothing | Drive the plan the pointer names. |
| Nothing is set, and exactly one plan is open | Drive it, and set the pointer so the next session does not have to work it out again. |
| Nothing is set, and several plans are open | Ask which, then set it. Do not pick. |
| The pointer is dangling | **Stop.** It was renamed or it was deleted; the file cannot say which and the two fixes are opposite. Ask. |
| A plan finishes | Point at the next plan, or `--clear`. A pointer left on a finished plan reads as "this is what I am working on". |

`phase-status.cjs` reads it too, so once a pointer is set, `--plan` is only
needed to act on some *other* plan.

**It is a pointer, not a lock.** Nothing stops work on a plan it does not name -
`--plan` still addresses any of them. What it buys is that a session, a hook, or
a person picking the work back up gets the same answer to "which one", instead
of each guessing from whatever happens to be open.

**Committed, which means shared.** Two people driving two different plans will
overwrite each other's line, and the diff reads as one of them changing the
other's plan. That is the accepted cost of keeping the answer in the repository;
a team that hits it often wants one of them on a branch, not an uncommitted
pointer that silently disagrees between machines.

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
| A warning about `.current` | Settle it first - see the pointer's rules above. A dangling pointer means a plan was renamed or deleted, and neither is something to work around. |
| Nothing relevant | Create a plan. |

Its header line says which plan is current, and the plan it names is marked
`<- current`.

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
`findings.md`. Then point `.current` at it, so the plan that was just created is
the one the next command drives:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/current-plan.cjs --set docs/planning/<dir>
```

Say what it moved from, especially when it moved off an unfinished plan - that
is a decision to put the other one down, and it should not happen silently.

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

## 4. BDD plans only: Phase 0 - harness, routes, design system, commands, baseline (and Phase 1)

A BDD plan cannot be written without this: the Scenario Queue's initial state
has to be **observed**, not guessed, and the six commands have to be real.
This is the last thing the planning skill does; Phase 1 onward is
`/bdd:implement`.

**Harness.** Run the suite. If it cannot execute at all, stop and use
`bdd-setup`. A missing harness is not something to work around one capability at
a time.

**Information architecture.** If any scenario in the feature is tagged `@web`,
record which route each of its pages lives at, and whether one of them is the
application's home. The feature file does not say - Gherkin describes what a
page does, never where it sits - so unasked, the route gets decided inside a
step definition by whoever writes `page.goto('/…')` first. That is a product
decision taken in test glue, where the person who owns the requirement will
never see it. Ask the user when the repository does not already answer it: an
application named after one capability usually opens on it, and getting that
wrong produces a green suite whose front door is still the framework's starter
page. The template's Phase 0 carries the table.

**Design system.** If any scenario in the feature is tagged `@web`, record what
says how the pages should look. Check all three - a design plugin like
`ui-ux-pro-max`, a UI component library, and a `DESIGN.md` (that exact filename,
at the project root or under `docs/` - search, do not test one path) -
and record every one that is there, because they coexist. The template's Phase 0
carries the table and the precedence rule.

If none of them is there, **ask the user** rather than planning around it.
Unlike a missing harness, nothing downstream will complain: scenarios assert
behaviour, so they go green on a page nobody could use. A feature that renders
no UI needs none - record that it is why, rather than leaving the row blank.

**Recording the decision is not the same as having a design system, and the
plan has to carry both.** Give every row in the table a `State` - `present`,
`to build in Phase 1`, or `declined` - and leave `Phase 1: Design system in
place` for whatever is `to build`. Search before marking anything `to build`,
and say where you looked when you mark something absent: Phase 1 builds what
this table says is missing, so a source overlooked here is a source overwritten
there. That phase installs the component library,
maps `DESIGN.md`'s values into it, and shows the mapping took effect. Planning
stops at a filled Phase 0 as before; Phase 1 is driven by `/bdd:implement`
with every other phase.

Without that split the plan names a design system that does not exist, and
Phase 4.x - told to style against the one named in Setup - has nothing to read.
That is the failure this is for: the scenarios still pass, so the plan reports a
finished feature nobody can use.

**Page layout.** Put one row per route into the template's Page layout table,
taken from the Information architecture table above. That is all Phase 0 owes
it: `Layout composed by` is filled in Phase 4.x as each page is first composed -
the design plugin that composed it, or `hand-written` with the reason - and
Phase 8 checks that no row was left blank. Phase 0's job is to make the rows
exist, because a page composed by nobody still renders, still passes, and still
looks like work.

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

**Close the phase.** The template ships Phase 0 as `in_progress`, because
copying it is what starts the phase - so planning is not finished until
somebody ends it. Tick its boxes as each one is observed, write the evidence
into `progress.md`, then:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/phase-status.cjs 0 complete --plan docs/planning/<dir>
```

and rewrite `## Next Step` to name Phase 1 (or Phase 2, where the feature
renders no UI).

Left `in_progress`, nothing downstream complains: `/bdd:implement` starts at
Phase 1 regardless, and the checkbox warnings only catch a `complete` phase
over an open box. What breaks is the record. `planning-status.cjs` reports the
first phase that is not complete, so a plan handed over this way says the work
is still in Phase 0 for the rest of its life - the status board describing
setup while the capabilities are being built.

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
node ${CLAUDE_PLUGIN_ROOT}/scripts/phase-status.cjs 4.2 complete --plan docs/planning/<dir>
```

A capability's phase is addressed by its sub-number - `4.2`, not `4`. Asking
for `4` moves the parent Phase 4 status and leaves every capability alone;
asking for `4.2` moves that one capability and nothing else. The difference is
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
| `assets/task_plan-bdd.md` | The feature-wide loop, one `Phase 4.x` per capability |
| `assets/progress-bdd.md` | What was run per capability, and what it printed |
| `assets/findings-bdd.md` | Decisions, and the specification problems implementing exposed |
| `assets/task_plan-general.md` | Phase plan for work with no feature file |
| `assets/progress-general.md` | What was run per phase, and what it printed |
| `assets/findings-general.md` | Decisions, and where reality differed from what was assumed |
| `${CLAUDE_PLUGIN_ROOT}/references/test-layout.md` | Where unit tests go, per stack - and why never beside the code |
| `${CLAUDE_PLUGIN_ROOT}/references/development-skills.md` | Stack-specific guidance the templates tell Phase 4.x / Phase 3 to read |

| Script | What it is for |
|---|---|
| `scripts/planning-status.cjs` | Read the plans: what is in progress, what needs attention |
| `scripts/phase-status.cjs` | Write one phase's status, safely |
| `scripts/current-plan.cjs` | Read and move `.current`, the pointer at the plan being driven |
