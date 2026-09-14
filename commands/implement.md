---
description: Drive an existing plan forward - outside-in TDD for a BDD plan, phase by phase for a general one. Pauses after each phase by default; pass --auto to run straight through.
argument-hint: "[plan directory] [--auto]"
---

# Drive the plan

Build the code the plan calls for, one phase at a time, writing the evidence to
`progress.md` as it happens.

This command **drives**. It does not create plans - `/bdd:plan-with-feature`
and `/bdd:plan` do that, through the `planning` skill. If there is no plan, say
so and point at those rather than improvising one.

It refuses to write production code that no failing test asked for.

Arguments the user gave: `$ARGUMENTS`

## Pausing

**Default: stop after every phase.** Write the evidence, move the status,
report what happened and what is next, and then wait. The user decides whether
to continue.

**`--auto`: run straight through** without pausing between phases, until the
plan is done or something in **When to stop and ask** below forces a halt.

`--auto` never disables the gates. It removes the pause between phases; it does
not remove the RED gate, the scope rule, the test-integrity rule, or any of the
stop conditions. A phase whose checks were not observed does not become
complete because nobody was watching.

A BDD plan's `Phase 4` expands into one sub-phase per capability, and each of
those is a phase for pausing purposes. A nine-capability feature therefore
pauses nine times in the default mode. If the queue is long and the user is not
watching, say so and suggest `--auto` rather than quietly running on.

## 1. Find the plan

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

| Argument | Behaviour |
|---|---|
| A plan directory | Use it. |
| Nothing, one plan open | Use it. |
| Nothing, several open | List them and ask which. |
| Nothing, no plans | Stop. Point at `/bdd:plan-with-feature` or `/bdd:plan`. |

Then **read all three files** and run `git diff --stat` to see code the plan
may not know about yet. `progress.md` has a **Reboot check** table for this.

A drift warning stops the run: the feature file moved after the plan was made.
Do not diff-and-guess which scenarios changed. Follow **Drift** in the
`planning` skill.

## 2. A general plan: phase by phase

Work the phases in order. For each one:

- Move it to `in_progress` **before** the first action.
- Tick each `- [ ]` to `- [x]` as it is observed, one at a time.
- **Run the `Verifies` line for real.** Do not reason about what it would
  print. A change that was never executed is not verified, however obviously
  correct it looks.
- Paste the real output into `progress.md`.
- Move it to `complete` **after** the evidence is written, and rewrite
  `## Next Step`.

If the verification cannot be run here - it needs credentials, a cluster, a
device, a review - say so plainly, name what is missing, and leave the phase
`in_progress`. An unverifiable phase is not a complete one.

## 3. A BDD plan: the loop

**Phase 1 comes first, when the plan has one.** Planning leaves it `pending`:
it is where the design system the plan names actually gets built - the component
library installed, `DESIGN.md`'s values mapped into it, the mapping shown to
have taken effect. Drive it before Phase 2 like any other phase, and do not skip
it because the scenarios would pass without it. They would: they assert
behaviour, and an unstyled page satisfies every one of them. A feature delivered
that way is green and unusable, and no later phase in this plan looks at it
again.

A row the Design System table marks `declined` needs no work - write the
decision and its date into `progress.md` and move the phase to `complete`. A
feature that renders no UI is the same. What must not happen is Phase 1 left
`pending` while Phase 2 starts.

Then one pass over the whole feature. Phases 1, 2, 4, 5, 6 and 7 run once each;
Phase 4 expands into one sub-phase per capability, and those are the only thing
that repeats:

```
per feature   2 outer RED (every scenario)
           -> 3 break into capabilities + write every failing unit test
           -> 4.1 -> 4.2 -> ... -> 4.N   (code, in dependency order)
           -> 5 all units green
           -> 6 outer GREEN (every scenario) -> 7 refactor -> 8 delivery
```

Nothing resets. Every capability keeps its own numbered phase and its own
status, so `task_plan.md` shows the whole shape of the work at once.

Phase 3 comes **after** the outer RED, never before: the failures are what say
which capabilities are missing. A breakdown written earlier is a guess about
code nobody has run.

The plan is the authority on the steps. This command is the authority on the
four things the plan cannot enforce on its own.

### The RED gate

Phase 2 is not complete until at least one scenario fails **on an assertion
whose message names the expected outcome against the actual one**, and every
other scenario is classified from what the run printed.

An `undefined` step is not RED. It says nobody has claimed the sentence yet,
not that the behaviour is wrong. A step definition that logs and returns is not
RED either. Neither is a failure caused by a typo, a broken fixture, a missing
dependency, or a scenario that was already failing for an unrelated reason.

`${CLAUDE_PLUGIN_ROOT}/references/step-definitions.md` is the detail: what a valid RED looks like per
stack, why `Given`/`When`/`Then` failures mean different things, and the
anti-patterns that produce a red run that proves nothing.

**`blocked` is not RED, and it is not a pass either.** A scenario whose `Given`
cannot establish its state - because the seam it seeds through does not exist
yet - never reached an assertion. Record it as `blocked`, name the missing seam
in `progress.md`, and add that seam to the Capability Queue. Counting a blocked
scenario as red overstates what has been proven; leaving it `undefined`
pretends nobody has looked.

**A scenario cannot fail on an assertion until the shape it drives exists.**
When the UI is not there at all, every scenario dies in its `When` before any
assertion runs and the gate is not passed. Build the **skeleton** in the same
pass as the step definitions rather than spending a run to be told the page is
missing: its shape is what the glue you just wrote addresses - the routes,
labels and roles it names - not a guess. Look at what already exists before
writing; a partly built feature must not be overwritten.

A skeleton is the shape the step definitions drive, with no behaviour behind it:
an empty form, an empty list. **It must not satisfy a single assertion** - one
that passes against a skeleton is green without ever having been red, so name it
in `progress.md` and observe it again at Phase 6. Say what the skeleton
deliberately does not do. A skeleton is not production code for the scope rule's
purposes, and it is not progress either.

Until the gate is passed, **do not edit production code**. Everything the loop
is worth rests here: without a scenario that fails for the right reason, there
is no evidence the code written next was needed, and none that it does what the
feature says.

### The scope rule

Inside a `Phase 4.x`, write only what that capability's failing test asked for.
Code for a later capability belongs to its own phase. Code no capability asks
for should not be written without saying so and getting an answer.

Do not run the whole suite in a `4.x` phase to see whether the feature works.
That is Phase 6. What each sub-phase observes is its own capability's test, and
that every previously passing test still passes.

### The layout rule

A capability that renders a page for the first time does not invent its layout.
It comes from the design plugin the plan names, handed `DESIGN.md`, the
component library and what the scenarios say is on the page - and the source
goes in the plan's **Page layout** table.

This is the one UI rule with no downstream check at all. A scenario asserts
behaviour, so it passes on a page composed by nobody exactly as it passes on a
designed one; `<unit-test>` never renders the page; Phase 6 only re-reads the
same assertions. Tokens make it the right colour, the component library makes
the parts real, and neither of them decides what goes where. If that decision is
not taken by the designer, it is taken by whoever writes the markup - silently,
and permanently, because nothing afterwards looks at it again.

`hand-written` is an allowed answer when there is no design plugin, or the page
is a single element. Writing it while a design plugin sits installed and unused
needs a reason beside it.

### The stack-guidance rule

Before writing a `Phase 4.x` capability's code, read the **Development skills**
the plugin's `README.md` lists for this stack, and record in `progress.md` what
they changed. A stack with no row in that table has no reference here - say so
rather than reaching for one written for a different stack.

**Do this even when the plan file does not ask for it.** The check belongs in
every `Phase 4.x` block, but it is the first one a thin plan leaves out: it
costs a round-trip, it changes nothing a reader can see, and no later phase
looks for it. `<unit-test>` does not know what was read, Phase 6 re-reads the
same assertions, and Phase 8 counts scenarios. If the plan in hand is missing
it, add it to the remaining blocks and say so - a plan written without it is the
reason to apply the rule, not a licence to skip it.

**"Read it, it changed nothing" is a different fact from never having opened
it**, and only one of them can be checked afterwards. Write down which.

### The test-integrity rule

Every test is written in Phase 3, before any production code - with one
exception, which has to be declared rather than worked around: a capability the
stack genuinely cannot unit-test (an `async` server component a unit runner
cannot render, say). Give that row `**no unit test**` in the queue, quote the
limitation in `progress.md`, and keep it as thin as possible so the untestable
surface stays small. Never invent a test that asserts nothing to fill the
column, and never let such a row absorb logic a neighbour could have tested.

**Tests go in the test root, never beside the file under test** -
`${CLAUDE_PLUGIN_ROOT}/references/test-layout.md` has the per-stack locations
and the reasons.

Phase 3's own gate is that **every** test fails. A test that passes against a
skeleton has not been shown to test anything. When placeholder return values
make some tests pass for free - a skeleton returning `[]`, `null` or `false`
happens to satisfy assertions expecting exactly that - make the skeleton throw
instead, and record why in `progress.md`.

When a Phase 3 test turns out to have guessed wrong - the interface it assumed
is not the interface that emerged - change it and record it under **Predictions
that were wrong** in `progress.md`, with what replaced it. Never quietly
reshape a test to match code that was just written: that inverts the order the
whole method depends on, and nothing in the files would show it happened. The
same goes for deleting, skipping or loosening a test to reach Phase 5; that
phase asks about it directly.

### Delivery

Phase 8 closes the feature: every row in the Scenario Queue `green`, every row
in the Capability Queue `done`, `<coverage>` regenerated, every requirement tag
covered. Then report the way `run` does: the numbers, then what they do not
cover.

A scenario still `blocked` at Phase 8 means the Capability Queue was
incomplete. Say that, and name the seam - never report the feature as done with
a blocked row in its queue.

**A feature only the suite can reach is not delivered.** When this is not the
first `@web` feature, check that a person can get to it from what is already
built: capture a run and generate the page flow (`flow-map`), then look for a
page with no inbound edge. `page.goto` in a step definition reaches every page
regardless, so a missing path never shows up as a failing scenario - two
features stay green as two islands.

**This check is the backstop, not where navigation gets decided.** How a person
arrives at a screen is behaviour; `discover` asks for it before the feature file
exists, and the answer is supposed to be one of the scenarios you have just made
pass. So a page with no inbound edge here is not a discovery, it is the receipt
for a question nobody asked - and by now the screen is built, styled, and
committed, which is why it cannot be fixed from inside this plan.

Report it that way. Say which screen, say that its arrival was never specified,
and send it to `discover` as a requirement that was missed rather than as a
tidy-up. Before writing the scenario, work out how it got past `discover`: a
second feature that skips the same question leaves a second island, and the
report alone has never stopped that - it is written into a plan that closes, and
the next plan starts somewhere else.

Name anything deliberately left undone, and name every assumption still marked
`assumed - unconfirmed` in `findings.md`. A feature reported as done while a
step definition encodes a guess nobody agreed to is worse than one reported as
unfinished.

## 4. Moving statuses and ticking boxes

Both are the `planning` skill's rules, and they hold here without exception:
status is moved with `phase-status.cjs`, `complete` comes **after** the
evidence is in `progress.md`, `## Next Step` is rewritten in the same pass, and
boxes are ticked one at a time as each check is observed.

## When to stop and ask

These halt the run even under `--auto`:

- The RED gate cannot be reached because the scenario is ambiguous - a sentence
  could mean two things. Record it under **Specification issues found while
  implementing** in `findings.md` and go back to `discover`. Never resolve an
  ambiguity by picking one meaning inside a step definition.
- The feature contradicts existing code or another feature.
- **Three attempts at the same error have failed.** Say what was tried, quote
  the error, name what is unclear. Do not open a fourth.
- Making the scenario pass would require a change nobody asked for - a schema
  migration, a new dependency, a change to another feature's behaviour.
- Phase 3 cannot enumerate the capabilities because the feature's scenarios
  disagree with each other, or because a `blocked` scenario needs a seam whose
  shape nobody has decided.
- The plan has drifted from the feature file.

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
- **A test changed after the code it checks proves nothing.**
- **This command does not edit feature files.** Behaviour changes go through
  `discover`, where the people who own the requirement can see them. A pure
  wording fix that resolves an ambiguity is still a change to a document
  someone signed off: ask before making it, and record it in `findings.md`
  with who agreed.
