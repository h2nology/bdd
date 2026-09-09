---
name: implement
description: This skill should be used when feature files exist but the code behind them does not, and the work of building it has to be driven and tracked - for example "implement this feature", "make these scenarios pass", "start development on checkout.feature", "drive this feature to green", "continue where we left off", "what was I working on", "set up the plan for this feature", or when a change has to be planned and verified but has no feature file at all, such as infrastructure, a dependency upgrade or a visual-only change. Keeps task_plan.md, progress.md and findings.md per feature under docs/planning/, and drives outside-in TDD: a failing scenario outside, failing unit tests inside.
hooks:
  Stop:
    - hooks:
        - type: command
          command: "[ -n \"${CLAUDE_PLUGIN_ROOT:-}\" ] && node \"${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs\" --warnings-only 2>/dev/null; exit 0"
---

# Drive a feature to green

Turn a specified feature into working code, one capability at a time, keeping
the plan, the evidence and the decisions on disk so the work survives a lost
context, a new session, or a different person.

This is the step `discover` leaves open. `discover` produces feature files;
`init` makes them executable; `run` measures them. None of them writes the
code. This skill does, and it refuses to write any that no failing scenario
asked for.

## Communication policy

The line is drawn at **who reads it**, not who wrote it - the same rule the
rest of this plugin follows.

- **Planning prose follows the user's language.** Goals, phase titles, the next
  step, questions, decisions and findings are written in the language the team
  speaks. These files are read by the people doing the work.
- **Structure stays English.** Headings, field names, status values - phases
  (`pending`, `in_progress`, `complete`), scenarios (`undefined`, `red`,
  `blocked`, `green`) and capabilities (`todo`, `in_progress`, `done`) - tags,
  file and directory names, commands, and pasted tool output. The status script
  parses them, so they must not shift with the prose.
- **Code and commits stay English**, as everywhere else in this plugin.
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

## Workflow

### 1. Pick up, or start

Always look before creating:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

| What it shows | What to do |
|---|---|
| A plan `in_progress` for what the user asked | Resume it. Go to step 3. |
| A plan `in_progress` for something else | Say so before starting a second one. Two open plans is a choice, not an accident. |
| A drift warning on a plan | Stop. See **Drift** below. |
| Nothing relevant | Create a plan. Go to step 2. |

Resuming means reading all three files of that plan **before** doing anything
else, and running `git diff --stat` to see code that the files may not know
about yet.

### 2. Create the plan

Decide which template applies, and be honest about it:

| The work | Template set |
|---|---|
| A feature file's scenarios have to pass | `assets/*-bdd.md` |
| Real work with no observable behaviour to sign off | `assets/*-general.md` |

If the task changes behaviour a user could observe and a stakeholder could sign
off, it needs a feature file. Say so and use `discover` first, rather than
opening a general plan and building it untested. "It's only a small change" is
how behaviour gets past the specification.

Then:

```bash
mkdir -p docs/planning/$(date +%Y-%m-%d)-<slug>
```

Copy all three files of the chosen set into it, dropping the suffix:
`task_plan-<set>.md` becomes `task_plan.md`, and the same for `progress.md` and
`findings.md`.

**Never mix the two sets.** A BDD plan with a general `progress.md` has nowhere
to record the RED evidence, and a general plan with a BDD `findings.md` asks
its author about scenarios that do not exist.

Then fill the `## Source` table - for a BDD plan, the feature path and its
fingerprint:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs --fingerprint features/<name>.feature
```

Translate the prose into the user's language as you fill it in. Leave a
placeholder unfilled rather than inventing a value for it.

### 3. Phase 0 - harness, commands, baseline

Only for BDD plans; a general plan goes straight to its own Phase 1.

**Harness.** Run the suite. If it cannot execute at all, stop and use `init`.
A missing harness is not something to work around one capability at a time.

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

`<cucumber-feature>` is what Phases 1 and 5 use - the loop now takes the whole
feature at once, so a per-scenario command is not enough on its own.

**Confirm `<cucumber-feature>` actually filters, by counting the scenarios it
runs.** A runner config that pins the feature glob makes the runner ignore a
path given on the command line and run the whole suite instead, silently -
cucumber-js does exactly this when `cucumber.mjs` sets `paths`. Drop that key
(the `init` skill's TypeScript reference explains it) and the path argument
works. If it cannot be dropped, a union of the feature's requirement tags is the
fallback, and then say in the plan that **the command is coupled to the
feature's scenario list**: adding a scenario without updating it under-tests the
feature and nothing complains.

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

### 4. The loop

One pass over the whole feature, not one per scenario. Phases 1, 2, 4, 5, 6 and
7 run once each; Phase 3 expands into one sub-phase per capability, and those
are the only thing that repeats:

```
per feature   1 outer RED (every scenario)
           -> 2 break into capabilities + write every failing unit test
           -> 3.1 -> 3.2 -> ... -> 3.N   (code, in dependency order)
           -> 4 all units green
           -> 5 outer GREEN (every scenario) -> 6 refactor -> 7 delivery
```

Nothing resets. Every capability keeps its own numbered phase and its own
status, so `task_plan.md` shows the whole shape of the work at once.

Phase 2 comes **after** the outer RED, never before: the failures are what say
which capabilities are missing. A breakdown written earlier is a guess about
code nobody has run.

Each capability carries a `Needs` - what it cannot be built before - and the
queue is numbered `3.1`, `3.2`, ... in that order. That ordering does real work:
if a capability's test fails because a prerequisite is missing rather than
because the capability itself is, the queue is in the wrong order, and no amount
of code written next will be the code that test was asking for.

The plan is the authority on the steps; this skill is the authority on the four
things the plan cannot enforce on its own:

**The RED gate.** Phase 1 is not complete until at least one scenario fails
**on an assertion whose message names the expected outcome against the actual
one**, and every other scenario is classified from what the run printed.

An `undefined` step is not RED. It says nobody has claimed the sentence yet,
not that the behaviour is wrong. A step definition that logs and returns is not
RED either. Neither is a failure caused by a typo, a broken fixture, a missing
dependency, or a scenario that was already failing for an unrelated reason.

**`blocked` is not RED, and it is not a pass either.** A scenario whose `Given`
cannot establish its state - because the seam it seeds through does not exist
yet - never reached an assertion. Record it as `blocked`, name the missing seam
in `progress.md`, and add that seam to the Capability Queue. Counting a blocked
scenario as red overstates what has been proven; leaving it `undefined`
pretends nobody has looked.

Until the gate is passed, **do not edit production code**. Everything the loop
is worth rests here: without a scenario that fails for the right reason, there
is no evidence the code written next was needed, and none that it does what the
feature says.

**The scope rule.** Inside a `Phase 3.x`, write only what that capability's
failing test asked for. Code for a later capability belongs to its own phase.
Code no capability asks for should not be written without saying so and getting
an answer.

**The test-integrity rule.** Every test is written in Phase 2, before any
production code - with one exception, which has to be declared rather than
worked around: a capability the stack genuinely cannot unit-test (an `async`
server component a unit runner cannot render, say). Give that row
`**no unit test**` in the queue, quote the limitation in `progress.md`, and keep
it as thin as possible so the untestable surface stays small. Never invent a
test that asserts nothing to fill the column, and never let such a row absorb
logic a neighbour could have tested. When one of them turns out to have guessed wrong - the
interface it assumed is not the interface that emerged - change it and record
it under **Predictions that were wrong** in `progress.md`, with what replaced
it. Never quietly reshape a test to match code that was just written: that
inverts the order the whole method depends on, and nothing in the files would
show it happened. The same goes for deleting, skipping or loosening a test to
reach Phase 4; that phase asks about it directly.

When every row in the Capability Queue is `done`, go to Phase 4, then 5 and 6.
There is no per-scenario handover any more - the feature is driven once, and
`## Current Capability` is the only pointer that moves.

### 5. Delivery

Phase 7 closes the feature: every row in the Scenario Queue `green`, every row
in the Capability Queue `done`, `<coverage>` regenerated, every requirement tag
covered. Then report - and report the way `run` does: the numbers, then what
they do not cover.

A scenario still `blocked` at Phase 7 means the Capability Queue was
incomplete. Say that, and name the seam - never report the feature as done with
a blocked row in its queue.

Name anything deliberately left undone, and name every assumption still marked
`assumed - unconfirmed` in `findings.md`. A feature reported as done while a
step definition encodes a guess nobody agreed to is worse than one reported as
unfinished.

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

### The checkboxes are the phase's real content

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

Nothing advances a status automatically, and nothing should. Whether a phase is
done is a judgement about evidence - the RED gate especially, where the same
`<unit-test>` command and the same output mean opposite things in Phase 2
(every test must fail) and in a `Phase 3.x` (this one must pass, the rest must
still be exactly the capabilities not yet built). When
the session ends, a `Stop` hook runs `planning-status.cjs --warnings-only`: it
reports drifted, stalled, blocked and self-contradicting plans - including a
phase whose status and checkboxes disagree - and stays silent otherwise. It reports; it never edits, and it never blocks the stop.

## Drift

A BDD plan records the feature file's fingerprint. When it no longer matches,
the specification moved after the plan was made.

Stop and say so. Do not diff-and-guess which scenarios changed, and do not
carry on against the old queue. Ask which it is:

- The feature genuinely moved on - close this plan, note why in its
  `findings.md`, and open a new dated plan against the new feature.
- The change was incidental (a typo, a reworded description) - confirm that
  with the user, then re-fingerprint and continue.

## When to stop and ask

- The RED gate cannot be reached because the scenario is ambiguous - a sentence
  could mean two things. Record it under **Specification issues found while
  implementing** in `findings.md` and go back to `discover`. Never resolve an
  ambiguity by picking one meaning inside a step definition.
- The feature contradicts existing code or another feature.
- Three attempts at the same error have failed. Say what was tried, quote the
  error, name what is unclear. Do not open a fourth.
- Making the scenario pass would require a change nobody asked for -
  a schema migration, a new dependency, a change to another feature's behaviour.
- Phase 2 cannot enumerate the capabilities because the feature's scenarios
  disagree with each other, or because a `blocked` scenario needs a seam whose
  shape nobody has decided. Name the decision and ask - a capability invented to
  fill the gap is a design nobody signed off.

## Hard limits - say these out loud

- **A scenario that was never run is not green.** Never mark a row `green`, or
  write `PASS` in `progress.md`, for something that was not executed.
- **Production code before a red scenario is not TDD.** If it happened anyway -
  the code was already there, or it got written before the gate - say so in
  `progress.md` rather than backfilling a test and calling it RED.
- **A passing scenario built on an unconfirmed assumption is a false report.**
  It now claims a requirement is verified when nobody agreed what it means.
  Flag it every time the feature's status is reported.
- **Skipped, quarantined and `@wip` scenarios are not covered.** Count them as
  what they are. So is a `blocked` one: its assertion never ran.
- **A test changed after the code it checks proves nothing.** If a Phase 2 test
  had to change during a `Phase 3.x`, it goes in **Predictions that were
  wrong** in `progress.md`, with the reason. A test quietly reshaped to fit
  code that was just written is worse than no test, because the file still
  claims one.
- **This skill does not edit feature files.** Behaviour changes go through
  `discover`, where the people who own the requirement can see them.

## Reference files

| File | What it is for |
|---|---|
| `assets/task_plan-bdd.md` | The feature-wide loop, one `Phase 3.x` per capability |
| `assets/progress-bdd.md` | What was run per capability, and what it printed |
| `assets/findings-bdd.md` | Decisions, and the specification problems implementing exposed |
| `assets/task_plan-general.md` | Phase plan for work with no feature file |
| `assets/progress-general.md` | What was run per phase, and what it printed |
| `assets/findings-general.md` | Decisions, and where reality differed from what was assumed |
| `references/step-definitions.md` | Making a step definition fail for the right reason |

| Script | What it is for |
|---|---|
| `scripts/planning-status.cjs` | Read the plans: what is in progress, what needs attention |
| `scripts/phase-status.cjs` | Write one phase's status, safely |
