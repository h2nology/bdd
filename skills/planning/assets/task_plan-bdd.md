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
changes or the current capability moves on.>

## Current Capability

<`Phase 3.x` and the capability name, copied from the queue below>

## Scenario Queue

Every scenario in the feature. `State` mirrors the last run - it is observed,
not decided. Refresh it by running the suite, never by hand.

This queue does not drive the loop any more; the Capability Queue does. What it
does is say how much of the specified behaviour actually passes, which is the
only number that closes the feature.

| # | Tag | Scenario | State |
|---|---|---|---|
| 1 | `@REQ-<id>` | <name> | `green` |
| 2 | `@REQ-<id>` | <name> | `red` |
| 3 | `@REQ-<id>` | <name> | `blocked` |
| 4 | `@REQ-<id>` | <name> | `undefined` |

`undefined` - no step definition claims these sentences yet.
`red` - the steps run and the scenario fails on an assertion.
`blocked` - the steps are written, but a `Given` cannot establish its state
because a seam it needs does not exist yet. Not RED: the assertion never ran.
Whatever the `Given` needs becomes a capability below, and this row goes `red`
or `green` once that capability exists.
`green` - the scenario passes.

A `Scenario Outline` is one row: it is done when every `Examples` row passes.

## Setup

### Phase 0: Harness and baseline

- [ ] The cucumber harness runs at all - `<cucumber>` executes, even if
      everything in it fails. If it does not, stop and use the `bdd-setup`
      skill.
- [ ] Resolve this project's commands and fill the table below.
- [ ] If any scenario in this feature is tagged `@web`, fill the Information
      architecture table below - which routes, and whether one of them is the
      home page. Ask the user rather than letting a step definition decide it.
- [ ] If any scenario in this feature is tagged `@web`, fill the Design System
      table below, including its `State` column. All three sources coexist and do
      different jobs, so record every one that is there. **Search rather than
      testing one path** - `find . -name DESIGN.md -not -path '*/node_modules/*'`
      - and if you write that something is absent, write where you looked. A
      source marked `to build` because nobody searched for it is how Phase 0.1
      comes to overwrite a file the user put there. If none of the three is
      there, **ask the user** before planning any UI phase - do not plan around
      it. Deciding is all this phase does; **Phase 0.1 is what builds what the
      decision names.**
- [ ] Run the whole suite once and record the output in `progress.md`.
- [ ] Fill the Scenario Queue from that run. Some scenarios may already be
      `green` - the feature may be partly built.
- **Status:** `in_progress`

| Placeholder | This project's command |
|---|---|
| `<cucumber>` | <run the whole suite> |
| `<cucumber-one>` | <run one scenario by tag> |
| `<cucumber-feature>` | <run every scenario in this feature> |
| `<unit-test>` | <run the unit tests> |
| `<unit-test-one>` | <run one unit test file or name> |
| `<coverage>` | <requirement coverage report> |

Resolve these once, here, and use the placeholders everywhere below. This
plugin supports TypeScript, Java, Python and .NET; nothing below may assume one
of them.

**Confirm each one by the count it prints, not by the fact that it ran.**
`<cucumber-feature>` especially: a runner config that pins the feature glob
makes a path argument silently run the whole suite. If the recorded command is a
tag union rather than a path, say so here - it is coupled to this feature's
scenario list, and adding a scenario without updating it under-tests the feature
with nothing to warn you.

### Information architecture

Only for features that render UI, like the design system below.

**Which route does each of this feature's pages live at, and is one of them the
application's home?** The feature file does not say - Gherkin describes what a
page does, never where it sits - so if nobody decides, the route is decided
inside a step definition by whoever writes `page.goto('/…')` first. That is a
product decision taken in test glue, where the person who owns the requirement
will never see it.

| Question | Answer |
|---|---|
| Routes this feature's pages live at | |
| Is one of them the home page (`/`)? | |
| What the home page serves today | |

**Ask the user when the repository does not already answer it.** An application
named after one capability usually opens on it: "a student management system"
opens on the student roster, not on a framework's starter page with the roster
filed away under `/students`. That mistake produces a green suite and an
application whose front door is still the template - and no scenario fails,
because no scenario says where anything is.

Keep each route in one place in the glue, so changing it is one edit.

### Design system

Only for features that render UI. Leave it out for an API-only or CLI feature,
and say that is why.

Check for all three. They **coexist and they do different jobs** - none of them
replaces another, so finding one is not a reason to stop looking:

| Source | Its job | Check for | Found? Where? | State |
|---|---|---|---|---|
| `DESIGN.md` | **The authority on values** - colours, type scale, radii, spacing, per-component specs | **that exact filename**, at the project root or under `docs/`. Search for it - `find . -name DESIGN.md -not -path '*/node_modules/*'` - rather than testing one path | | |
| A UI component library | **The carrier** - the components those values get applied to | shadcn/ui, Ant Design, MUI, Bootstrap, Chakra, Mantine, Vuetify, an internal one - the dependency, and where it keeps its tokens and component specs | | |
| A UI/UX design plugin | **The designer** - it composes pages out of the other two, which is the part `DESIGN.md` does not specify | `ui-ux-pro-max` or its kind is installed, and whether it has already written a spec | | |

`State` is one of `present` - it is there and usable as it stands;
`to build in Phase 0.1` - the user chose it and it does not exist yet;
`declined` - the user was asked and said no. Every row needs one. A row left
blank is the gap this table exists to make visible.

**Using them together is the normal case, not a special one.** They are not
three ways to answer one question; they answer three.

- **`DESIGN.md` with a component library**: its values have to *reach* the
  library's components. A library's preset defaults are not the design system.
  Map every token across, and where a component reaches for a different rung of
  a scale than `DESIGN.md` specifies - an 8px button rendered at 12px because
  the preset derives its radii from one number - change the component. The
  library is copied into the repository so that it can be changed.
- **A design plugin as well**: **use it**, and hand it both of the others as
  input. It is what turns tokens and components into a page layout, and a layout
  is precisely what `DESIGN.md` does not define. Having tokens already is not a
  reason to skip it.
- Where two of them define the same value differently, a hand-written
  `DESIGN.md` wins because someone decided it; say so rather than applying it
  silently.

**A plugin that is installed but not enabled is present, not absent.** Say which
it is and ask whether to enable it. Recording it as missing because this session
cannot see its skills turns an available designer into a gap nobody noticed.

**If none of them is there, ask the user** - and ask **which to add**, not which
one to pick, because they compose. Say what declining costs: Phase 3.x then
writes unstyled pages, and **nothing in any later phase catches that**, because
the scenarios assert behaviour and pass on a page nobody could use. The user may
still decline; that is their call, but record it here so it was a decision and
not a silent gap.

### Phase 0.1: Design system in place

Only for a feature with `@web` scenarios. An API-only or CLI feature marks this
phase `complete` with one line saying it renders no UI - not `pending` forever,
and not deleted, because a reader cannot tell a phase that did not apply from
one nobody did.

**Phase 0 decided what the design system is. This phase builds it.** The split
exists because deciding was never enough on its own: a plan that records
"shadcn/ui and a `DESIGN.md`" and then goes straight to Phase 1 arrives at Phase
3.x with neither of them on disk, and Phase 3.x's instruction to style against
the design system named in Setup has nothing to read. Nothing downstream
complains - the scenarios assert behaviour, so they go green on an unstyled
page, and the plan reports a feature that is done and unusable.

**Look before you build. The order of the first three checks is the phase.**
Every one of them runs before anything is created, because the cheapest way to
destroy a design system is to write a second one next to it.

- [ ] **Search for what already exists** - do not test one path, and do not
      trust the table above to have searched. `find . -name DESIGN.md -not -path
      '*/node_modules/*'` for the values; the dependency manifest plus the
      component directory for the library; the plugin list for the designer.
      **If you conclude something is absent, say where you looked.** A design
      system reported missing because it sat one directory away is the failure
      this check exists to prevent, and the step that follows such a report is
      writing a competing copy.
- [ ] **Reconcile the table with what the search found, before building
      anything.** A row marked `to build in Phase 0.1` whose artefact turns out
      to already exist becomes `present` - correct the row, say in `progress.md`
      that Phase 0 recorded it wrongly and how, and **build nothing for it**.
      The table is Phase 0's belief; the search is the fact. When they disagree
      the fact wins, and a plan that builds from the stale belief overwrites
      whatever was really there.
- [ ] You know **whose** design system it is. A `DESIGN.md` describing another
      product's brand may be exactly what the user intends - adopting an
      existing design language is a normal choice - or it may be a sample nobody
      meant to keep. **Ask; do not decide.** Writing a replacement because the
      content looked wrong discards a file the user may have put there
      deliberately, and the user finds out only when their own values stop
      appearing on the page. Record the answer in `progress.md`.
- [ ] Only now: every row still genuinely marked `to build in Phase 0.1` exists.
      Rows marked `present` are re-checked, not assumed - a dependency in the
      manifest is not the same as an initialised library.
- [ ] Anything this project needs that `DESIGN.md` does not define is listed in
      `progress.md` before any of it is invented. A brand spec written for
      marketing surfaces routinely has no data-table, no form-error and no empty
      state - and those are exactly what an internal tool is made of.
- [ ] The component library is installed **and initialised**: its config file
      and its components are in the repository, not just its name in the
      dependency manifest.
- [ ] **`DESIGN.md`'s values reach the library's components.** This is the check
      that earns the phase. Installing a library gives you its preset defaults,
      and a preset is not a design system - it is a different design system,
      belonging to whoever wrote the library. Map every token across - colours,
      type scale, radii, spacing - into wherever that library reads its theme
      from, and where a component reaches for a different rung of a scale than
      `DESIGN.md` specifies, change the component. A library whose components are
      copied into the repository is copied there so that they can be changed.
- [ ] **Show that the mapping took effect.** Take a value `DESIGN.md` defines,
      find it in what the library actually resolves to, and paste both into
      `progress.md`. Files existing is not values arriving: an install that
      wrote its own defaults over the theme leaves every file exactly where this
      phase expects it.
- [ ] A design plugin that is installed but not enabled is enabled now, or
      recorded here as declined. Enabling one may need the session reloaded
      before its skills are usable - say so rather than reporting it as ready.
- [ ] Record in `progress.md` what was installed, what was mapped, and anything
      `DESIGN.md` specifies that the library cannot express. That last list is
      the one Phase 3.x needs: it says where a page will have to depart from the
      spec, before anyone discovers it one component at a time.
- **Status:** `pending`

Where the user declined a design system in Phase 0, this phase is `complete` as
soon as that decision is written here with its date. Declining is an outcome;
skipping is not.

**Re-running this phase is an update, not a repair.** A changed `DESIGN.md`, a
swapped library, one new token - all of them come back through here, because the
mapping is the thing that goes stale and nothing else in the plan looks at it.

Every phase's `- [ ]` lines are ticked to `- [x]` as each check is observed,
while that phase is `in_progress` - not in a batch when its status changes. A
`complete` phase with an open box is a contradiction: either the check was
never made, or it was made and never written down.

## The Loop

One pass over the whole feature. Phases 1, 2, 4, 5, 6 and 7 run once each;
Phase 3 expands into one sub-phase per capability, and those are the only thing
that repeats:

```
per feature   1 outer RED (every scenario)
           -> 2 break into capabilities + write every failing unit test
           -> 3.1 -> 3.2 -> ... -> 3.N   (code, in dependency order)
           -> 4 all units green
           -> 5 outer GREEN (every scenario) -> 6 refactor -> 7 delivery
```

Nothing resets. Each capability has its own numbered phase with its own status,
so the file shows the whole shape of the work at once and the history does not
have to be reconstructed from `progress.md`.

**What this ordering costs, stated up front.** Writing every unit test in Phase
2 is a bigger up-front bet than writing them one at a time. A test written for
capability 5 can turn out to be wrong once capability 2 actually exists - the
interface it guessed at was not the interface that emerged. When that happens,
change the test and record it in `progress.md` as a prediction that was wrong,
with what replaced it. **Never quietly rewrite a test to match code that just
got written**; that inverts the whole point, and nothing in the file would show
it happened.

### Phase 1: Outer RED

Every scenario in the feature, not one of them.

- [ ] Run the whole feature: `<cucumber-feature>`.
- [ ] No step is left `undefined` - every sentence in every scenario has a step
      definition.
- [ ] Each step definition asserts the outcome its sentence states. A step that
      only logs, or returns without checking anything, does not count.
- [ ] At least one scenario fails **on an assertion**, with a message naming
      what was expected against what happened.
- [ ] Every other scenario is classified in the Scenario Queue as `red` or
      `blocked`, from what the run printed - never from expectation.
- [ ] For each `blocked` scenario, name in `progress.md` which seam its `Given`
      is missing, and add that seam to the Capability Queue.
- [ ] No failure is a typo, a broken fixture, a missing dependency, or an
      unrelated regression.
- [ ] Paste the failing output into `progress.md`.
- **Status:** `pending`

An `undefined` step is not RED. It says nobody has claimed the sentence yet,
not that the behaviour is wrong. Write the step definition with its real
assertion first.

A `blocked` scenario is not RED either, and it must not be counted as one. It
is an honest state with a named cause: the fixture seam it needs is not built.
Recording it as `blocked` and turning its cause into a capability is what keeps
the gap visible - Phase 5 will not accept it.

**Do not edit production code until this phase is `complete`.** This is the
gate the whole loop rests on: without a red scenario, nothing proves the code
written next was needed, or that it does what the feature says.

### Phase 2: Break the feature into capabilities, and write every failing test

Only now, after the outer RED. The failures say what is missing; before seeing
them, any breakdown is a guess about code nobody has run.

- [ ] List every capability the feature needs, across all its scenarios.
- [ ] Give each one a `Needs` - the capabilities it cannot be built before.
- [ ] Order the queue so nothing comes before what it needs, and number the
      rows `3.1`, `3.2`, ... in that order.
- [ ] Write one failing unit test for every capability in the queue - except a
      capability the stack genuinely cannot unit-test (see below). Name each
      exception in `progress.md` with the reason; never invent a test to fill
      the row.
- [ ] Run `<unit-test>` and watch **all** of them fail.
- [ ] Every failure names an expected value against an actual one - not an
      import error, not a missing file. Where a module has to exist for the
      assertion to be reached at all, create it as an empty skeleton and say so
      in `progress.md`.
- [ ] Every test's **first failing assertion is about its own capability**, not
      about something in its `Needs`. With the whole queue unbuilt a dependent
      test will otherwise trip on its prerequisite, and `Phase 3.x` will not be
      able to tell a real RED from a missing one. The fix is to open the test on
      the surface this capability adds - reorder the queue only if the order is
      genuinely wrong.
- [ ] Record every test and every failure in `progress.md`.
- **Status:** `pending`

#### Capability Queue

The feature's whole breakdown. One row per capability, one `Phase 3.x` each,
ordered by dependency. This is the spine of the plan - it is filled once, in
this phase, and rows are only marked `done` afterwards.

| # | Phase | Capability | Needs | Test | State |
|---|---|---|---|---|---|
| 1 | `3.1` | <the thing to build> | — | `<path::name>` | `done` |
| 2 | `3.2` | <thing> | 1 | `<path::name>` | `in_progress` |
| 3 | `3.3` | <thing> | 1, 2 | `<path::name>` | `todo` |

`todo` - no code yet. Normally its failing test is already written; a row that
Phase 1 appended for a `blocked` scenario's missing seam carries `todo` from the
moment it is recorded and gets its failing test in Phase 2, like every other row.
`in_progress` - being built.
`done` - its test passes, and so does everything that passed before it.

**A capability the stack cannot unit-test.** Some rows have no possible unit
test - an `async` server component several frameworks cannot render in a unit
runner, a wiring layer whose only observable behaviour is the page it produces.
Write `**no unit test**` in its `Test` column, say in `progress.md` which
framework limitation forces it and quote the source, and keep the row: its
verification is the outer scenario in Phase 5, and until then **nothing covers
it**. Two things this is not a licence for. Do not invent a test that asserts
nothing to fill the column - that is worse than the empty column, because the
row then looks covered. Do not let the row absorb logic that *could* be tested:
push every decision into a unit-testable neighbour and leave this row as thin
wiring, so the untestable surface is as small as you can make it.

`Test` names the file **and** the test within it, as a path under the project's
test root - never a path beside the file under test.
`${CLAUDE_PLUGIN_ROOT}/references/test-layout.md` has the per-stack roots and why. Naming the test before it exists is only
possible because the layout is predictable, which is the practical argument for
mirroring the source tree.

Order is a claim about dependency, not preference. If capability 3 needs
capability 2, it comes after it - otherwise its test fails for a reason that
has nothing to do with capability 3, and Phase 3.3 cannot tell a real RED from
a missing prerequisite.

Keep capabilities small. One that cannot be driven by one failing test is two
capabilities. A capability that no scenario in this feature needs does not
belong in the queue at all - say so rather than building it.

Adding a row after Phase 2 is allowed and has to be visible: append it with the
next free `3.x` number, write its failing test, watch it fail, and record in
`progress.md` why the Phase 2 breakdown missed it. Renumbering existing rows is
not allowed - their phases are already on the record.

### Phase 3: Write the code

One sub-phase per capability, in queue order. Copy the block below once per
row, and delete the spares.

Do not run the whole suite in these phases to see whether the feature works.
That is Phase 5. What each sub-phase observes is its own capability's test, and
nothing more.

- **Status:** `pending`

#### Phase 3.1: <capability name>

- [ ] Write the minimum production code that satisfies this capability's test.
- [ ] If this capability renders UI, style it against the design system **built
      in Phase 0.1** - the spec named in Setup, as it actually exists on disk.
      **Minimum is measured against that spec, not against a blank page.**
      An element left to the browser's defaults is outside the spec, and
      following the spec costs no more code than ignoring it - a styled button
      and a bare one are the same line. Do not invent a value the spec does not
      define either; that is outside it in the other direction.
- [ ] Stay inside this capability. The later rows have their own phases -
      writing them here means writing code no failing test asked for, and it
      will not be clear later which test proved which line.
- [ ] Run `<unit-test>`. This capability's test passes.
- [ ] Every unit test that passed before still passes. The ones still failing
      are exactly the capabilities not yet built - list them, and check that
      list against the queue.
- [ ] Record which files changed, and both runs, in `progress.md`.
- [ ] Mark this row `done` in the Capability Queue and move
      `## Current Capability` to the next row whose `Needs` are all `done`.
- **Status:** `pending`

#### Phase 3.2: <capability name>

- [ ] <same seven checks>
- **Status:** `pending`

### Phase 4: All units green

One run over everything, once every row in the Capability Queue is `done`.

- [ ] `<unit-test>` - every unit test passes, none skipped.
- [ ] The count matches the Capability Queue: one passing test per row, plus
      whatever the project had before this feature.
- [ ] Every test written in Phase 2 still exists and still asserts what it
      asserted then. A test that was deleted, skipped, or loosened to get here
      is named in `progress.md` with the reason.
- [ ] Record the run in `progress.md`.
- **Status:** `pending`

The third check is the one that matters. Everything above it can be satisfied
by weakening a test, and nothing else in this file would notice.

### Phase 5: Outer GREEN

- [ ] `<cucumber-feature>` - every scenario in this feature passes, including
      every `Examples` row of every outline.
- [ ] No row in the Scenario Queue is left `blocked` or `undefined`.
- [ ] `<cucumber>` - the whole suite - still passes. A new feature that breaks
      an old scenario is not done.
- [ ] Paste both outputs into `progress.md`.
- [ ] Commit. The message says which feature turned green.
- **Status:** `pending`

If a scenario is still failing here, the Capability Queue was incomplete - the
unit tests all pass and the behaviour still is not there. Append the missing
capability rather than patching the step definition, and say in `progress.md`
what the breakdown missed.

### Phase 6: Refactor

- [ ] Remove duplication in the production code and in the step definitions.
- [ ] `<unit-test>` still green.
- [ ] `<cucumber>` still green.
- [ ] Commit.
- **Status:** `pending`

## Delivery

### Phase 7: Feature complete

- [ ] Every row in the Scenario Queue is `green`.
- [ ] Every row in the Capability Queue is `done`.
- [ ] `<coverage>` run, and the requirement coverage report regenerated.
- [ ] Every requirement tag in this feature shows as covered.
- [ ] **If this is not the first `@web` feature, check a person can reach it from
      the ones already built.** Capture a run with flow capture on and generate
      the page flow (`flow-map`); a page with no inbound edge is reachable by the
      suite and by nobody else. `page.goto` in a step definition hides this, so
      it will not show up as a failing scenario. Missing navigation is
      behaviour: it goes back through `discover` and needs a scenario that
      **clicks**, not one that navigates.
- [ ] Anything deliberately left undone is named here and in `findings.md`.
      Silence is not an acceptable way to drop scope.
- [ ] Every assumption still marked `assumed - unconfirmed` in `findings.md` is
      repeated in the report. A passing scenario built on a guess nobody agreed
      to is a false report, not a green one.
- **Status:** `pending`

## Key Questions

Only questions that block the next phase. Answered ones move to `findings.md`
with their answer; they do not stay here.

1. <question>

## Blocked On

Anything outside this plan that has to happen before the next step can. Empty
when nothing is blocking - write it as prose, not as a list, because every
bullet here is reported as a live blocker.

- <blocker, and who or what resolves it>

---

Where things go, so the three files do not drift into each other:

| This file | `progress.md` | `findings.md` |
|---|---|---|
| Where the loop is now | What was actually run, and what it printed | What was learned and decided |
| The capability in hand | Every capability's history | Technical decisions, with reasons |
| Blocking questions | Errors, attempts, resolutions | Answered questions |
