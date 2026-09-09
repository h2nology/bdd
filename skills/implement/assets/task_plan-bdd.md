<!-- Prose is English here for legibility. In the real file, write the prose -
     the goal, the next step, scenario names, questions - in the team's
     language. Headings, field names, status values, tags, paths and commands
     stay English: the status script parses them. -->

# Task Plan: <Feature name>

## Source

| Field | Value |
|---|---|
| Feature | `features/<name>.feature` |
| Fingerprint | `sha256:<hash of the feature file when this plan was created>` |
| Started | `<YYYY-MM-DD>` |

If the feature file no longer matches the fingerprint, stop and say so. Do not
guess which scenarios changed. Either the feature moved on and this plan is
stale - start a new dated plan - or the drift is accidental and someone has to
look at it.

## Goal

Every scenario in this feature passes against real production code, and the
suite is still green.

## Next Step

<The single action that happens next. Rewrite it whenever a phase status
changes or the current scenario moves on.>

## Current Scenario

<@REQ-id and the scenario name, copied from the queue below>

## Scenario Queue

Every scenario in the feature, in the order they will be driven. `State`
mirrors the last run - it is observed, not decided. Refresh it by running the
suite, never by hand.

| # | Tag | Scenario | State |
|---|---|---|---|
| 1 | `@REQ-<id>` | <name> | `green` |
| 2 | `@REQ-<id>` | <name> | `red` |
| 3 | `@REQ-<id>` | <name> | `undefined` |

`undefined` - no step definition claims these sentences yet.
`red` - the steps run and the scenario fails.
`green` - the scenario passes.

A `Scenario Outline` is one row: it is done when every `Examples` row passes.

## Setup

### Phase 0: Harness and baseline

- [ ] The cucumber harness runs at all - `<cucumber>` executes, even if
      everything in it fails. If it does not, stop and use the `init` skill.
- [ ] Resolve this project's commands and fill the table below.
- [ ] Run the whole suite once and record the output in `progress.md`.
- [ ] Fill the Scenario Queue from that run. Some scenarios may already be
      `green` - the feature may be partly built.
- **Status:** `in_progress`

| Placeholder | This project's command |
|---|---|
| `<cucumber>` | <run the whole suite> |
| `<cucumber-one>` | <run one scenario by tag> |
| `<unit-test>` | <run the unit tests> |
| `<coverage>` | <requirement coverage report> |

Resolve these once, here, and use the placeholders everywhere below. This
plugin supports TypeScript, Java, Python and .NET; nothing below may assume one
of them.

## Outer Loop

Two loops, nested. Phases 1-7 run once per scenario; inside them, Phases 3-5
run once per unit in the Unit Queue:

```
per scenario   1 outer RED -> 2 break into units -> [ 3 unit RED -> 4 write
                              code -> 5 unit GREEN ] x units -> 6 outer GREEN
                              -> 7 refactor
```

Both levels reset as they go: Phases 3-5 back to `pending` for each next unit,
Phases 1-7 for each next scenario. Their history lives in `progress.md` - this
file only ever describes the scenario and the unit in hand.

The reason the inner three are separate phases rather than one: they are the
whole of TDD's rhythm, and a single phase lets them collapse into "wrote code,
ran tests, seems fine". Split, each one has to be observed before the next
begins.

### Phase 1: Outer RED

- [ ] Run only the current scenario: `<cucumber-one>`.
- [ ] No step is left `undefined` - every sentence has a step definition.
- [ ] Each step definition asserts the outcome its sentence states. A step that
      only logs, or returns without checking anything, does not count.
- [ ] The scenario fails **on an assertion**, and the message names what was
      expected against what happened.
- [ ] The failure is caused by the missing behaviour - not by a typo, a broken
      fixture, a missing dependency, or an unrelated regression.
- [ ] Paste the failing output into `progress.md`.
- **Status:** `pending`

An `undefined` step is not RED. It says nobody has claimed the sentence yet,
not that the behaviour is wrong. Write the step definition with its real
assertion first; the run counts as RED only once the failure names the expected
outcome against the actual one.

**Do not edit production code until this phase is `complete`.** This is the
gate the whole loop rests on: without a red scenario, nothing proves the code
written next was needed, or that it does what the feature says.

### Phase 2: Break the scenario into units

Only now, after the outer RED. The failure says what is missing; before seeing
it, any breakdown is a guess about code nobody has run.

- [ ] List everything that has to exist for this scenario to pass.
- [ ] Give each one a `Needs` - the units it cannot be built before.
- [ ] Order the queue so nothing comes before what it needs.
- [ ] Name the first unit as Current Unit.
- **Status:** `pending`

#### Unit Queue

Belongs to the current scenario only. Emptied and refilled when the scenario
changes; each unit's history stays in `progress.md`.

| # | Unit | Needs | State |
|---|---|---|---|
| 1 | <the thing to build, small enough to test on its own> | - | `done` |
| 2 | <thing> | 1 | `in_progress` |
| 3 | <thing> | 1, 2 | `todo` |

#### Current Unit

<the number and name of the unit being built, from the queue above>

Order is a claim about dependency, not preference. If unit 3 needs unit 2, it
comes after it - otherwise its unit test fails for a reason that has nothing to
do with unit 3, and Phase 3 cannot tell a real RED from a missing prerequisite.

Keep the units small. A unit that cannot be driven by one failing test is two
units.

### Phase 3: Unit RED

For the Current Unit.

- [ ] Write one failing unit test for it.
- [ ] Run `<unit-test>` and watch it fail.
- [ ] The failure names an expected value against an actual one - not an import
      error, not a missing file.
- [ ] **The failure is about this unit**, not about something in its `Needs`. If
      a prerequisite is what is missing, the queue is in the wrong order: fix
      the order and start with that one instead.
- [ ] Record the test and the failure in `progress.md`.
- **Status:** `pending`

### Phase 4: Write the code

- [ ] Write the minimum production code that satisfies that test.
- [ ] Stay inside the Current Unit. The next rows of the queue get their own
      RED first - writing them now means writing code no failing test asked
      for, and it will not be clear later which test proved which line.
- [ ] Record which files changed in `progress.md`.
- **Status:** `pending`

Do not run the suite here to see whether it worked. That is Phase 5, and
keeping them apart is what makes "it passes now" a recorded observation rather
than an impression formed while editing.

### Phase 5: Unit GREEN

- [ ] Run `<unit-test>`. The new test passes.
- [ ] Every unit test that passed before still passes.
- [ ] Record both in `progress.md`.
- **Status:** `pending`

Then, for the next unit:

1. Mark the finished unit `done` in the Unit Queue.
2. Move `#### Current Unit` to the next `todo` row whose `Needs` are all `done`.
3. Reset Phases 3-5 to `pending`.
4. Rewrite `## Next Step`.

When every row in the Unit Queue is `done`, go to Phase 6 instead.

### Phase 6: Outer GREEN

- [ ] `<cucumber-one>` passes.
- [ ] `<cucumber>` - the whole suite - still passes. A new scenario that breaks
      an old one is not done.
- [ ] Paste both outputs into `progress.md`.
- [ ] Commit. The message says which scenario turned green.
- **Status:** `pending`

### Phase 7: Refactor

- [ ] Remove duplication in the production code and in the step definitions.
- [ ] `<cucumber>` still green.
- [ ] Commit.
- **Status:** `pending`

Then, before starting the next scenario:

1. Mark the finished scenario `green` in the Scenario Queue.
2. Move `## Current Scenario` to the next `red` or `undefined` row.
3. Empty the Unit Queue - the next scenario gets its own, after its own RED.
4. Reset Phases 1-7 to `pending`.
5. Rewrite `## Next Step`.
6. Open a new entry in `progress.md`.

## Delivery

### Phase 8: Feature complete

- [ ] Every row in the Scenario Queue is `green`.
- [ ] `<coverage>` run, and the requirement coverage report regenerated.
- [ ] Every requirement tag in this feature shows as covered.
- [ ] Anything deliberately left undone is named here and in `findings.md`.
      Silence is not an acceptable way to drop scope.
- **Status:** `pending`

## Key Questions

Only questions that block the current scenario. Answered ones move to
`findings.md` with their answer; they do not stay here.

1. <question>

## Blocked On

Anything outside this plan that has to happen before the next step can. Empty
when nothing is blocking.

- <blocker, and who or what resolves it>

---

Where things go, so the three files do not drift into each other:

| This file | `progress.md` | `findings.md` |
|---|---|---|
| Where the loop is now | What was actually run, and what it printed | What was learned and decided |
| The scenario in hand | Every scenario's history | Technical decisions, with reasons |
| Blocking questions | Errors, attempts, resolutions | Answered questions |
