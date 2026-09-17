---
description: Plan the implementation of one Gherkin feature - create the dated planning directory, resolve this project's test commands, record the baseline run and fill the scenario queue, ready for /bdd:implement to drive.
argument-hint: "<feature file name or path>"
---

# Plan a feature

Turn one `.feature` file into a plan on disk: `task_plan.md`, `progress.md` and
`findings.md` under `docs/planning/<YYYY-MM-DD>-<slug>/`, with the scenario
queue filled from an actual run.

This command **plans only**. It writes no production code and no step
definitions. When it finishes, `/bdd:implement` drives the plan.

Arguments the user gave: `$ARGUMENTS`

## 1. Resolve the feature

The argument is a feature file name or path. Resolve it:

- An exact path that exists - use it.
- A bare name (`checkout`, `checkout.feature`) - find it under the usual roots:
  `features/`, `src/test/resources/features/`, `Features/`, `tests/features/`.
- Several matches - list them and ask which.
- No match - say so and stop. Do not create a feature file here; that is
  `discover`, where the people who own the requirement can see it.
- No argument at all - **work out which feature to build first and recommend
  it**, following section 2. Do not just list the unplanned files: the order is
  the whole question, and a list hands it back unanswered.

## 2. Which feature comes first

Skip this when the argument named a feature **and** every feature it depends on
is already built or planned. Otherwise it is the most useful thing this command
does: a suite is written in whatever order the requirements arrived, and that is
almost never the order it can be built in.

Start from what exists:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs <features-root> --json bdd-artifacts/spec.json
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

That gives the inventory and which features already have a plan. The ordering
itself is **not** in the JSON and cannot be computed from it - it is read out of
the step text, so read the `.feature` files themselves.

### What counts as a dependency

Feature B depends on feature A when **B's scenarios cannot be driven until A's
screens or behaviour exist**. Four things establish that. Weigh them in this
order:

1. **Arrival.** B's scenarios start on a screen A owns - `Given 我在学生名单页上`
   in a registration feature, where the roster feature is what puts that page on
   screen. This is the strongest signal and the most common, because `discover`
   asks every feature how a person reaches its screens, so the answer is sitting
   in the `Given` lines.
2. **The front door.** Whichever feature owns the route the application opens on
   comes first regardless, because every other plan's Phase 0 has to record its
   routes relative to one that exists.
3. **The shell.** A feature that builds the page other features hang controls on
   - a roster whose rows later grow an `编辑` and a `删除` button. The later
   features add to it; they cannot create it.
4. **Shared step sentences.** Not a dependency, a cost: the feature that defines
   the most sentences the others reuse should go first, or the same glue gets
   written twice and the second copy has to be reconciled with the first.

### What does not count - and is mistaken for it constantly

- **A `Given` that seeds data is not a dependency on the feature that creates
  that data through the UI.** `Given 系统中登记了以下学生:` seeds through a test
  seam. A deletion feature does **not** need the registration feature built.
  Reading it as a dependency is what produces a strict create-read-update-delete
  order that nothing in the specification asked for.
- **CRUD naming order is not a build order.** Read usually comes first, because
  the list is what everything else is reached from - not create, despite the C.
- **Requirement id order, file order and alphabetical order are not
  dependencies.** They record when somebody wrote the requirement down.
- **A shared step sentence is not a dependency by itself.** Two features
  asserting `Then 名单中显示以下学生:` tells you the glue is shared, not that one
  needs the other.

### Recommend it, with the evidence

Give the order, and for each feature **one line of why plus the file and line
that shows it** - `features/student_registration.feature:10` for the `Given`
that puts the user on another feature's page. A recommendation nobody can check
is a guess wearing a table, and the user is the one who knows whether the
dependency is real.

Say explicitly which features depend on **nothing** - those can be built in any
order, or in parallel, and that is worth knowing before someone builds them in
the order a list happened to print.

Then **ask**, rather than proceeding on the recommendation. Getting this wrong
costs a whole plan's work, and the user often knows a constraint the feature
files do not record - a demo, a dependency on another team, a page somebody has
already half-built.

## 3. Check for an existing plan

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

If a plan for this feature is already open, do not create a second one. Report
where it is and what it says happens next, and offer `/bdd:implement` instead.
A finished plan for a feature that has since grown gets a **new dated
directory** - never reopen the old one.

## 4. Build the plan

Follow the `planning` skill, using the **BDD template set** (`assets/*-bdd.md`).
It covers: the directory name, the Source table and fingerprint, Phase 0
(harness check, the six commands, the design system, the baseline run), and how
the queues are filled.

Three things this command must not skip, because they are what make the plan
usable rather than decorative:

- **The six commands are confirmed by running them**, not by reading
  `package.json`. `<cucumber-feature>` especially - prove it filters by making
  the scenario counts differ.
- **The Scenario Queue's states come from the baseline run.** Some scenarios
  may already be `green`. Never fill the column from expectation.
- **A `@web` feature names where its pages live.** Which route, and whether one
  of them is the application's home. Gherkin never says, so unasked it gets
  decided inside a step definition - a product decision taken in test glue. An
  app named after one capability usually opens on it.
- **A `@web` feature names what says how its pages should look, and carries a
  phase that builds it.** Check all three - `DESIGN.md` for the values, a UI
  component library to carry them, a design plugin like `ui-ux-pro-max` to
  compose pages out of both - and record every one that is there in Phase 0,
  with its path and its `State`. They do different jobs, so finding one is not a
  reason to stop looking. **Search for each, rather than testing one path**
  (`find . -name DESIGN.md -not -path '*/node_modules/*'`), and if you record
  one as absent, say where you looked - `DESIGN.md` lives at the project root or
  under `docs/`, and a source marked `to build` because nobody searched is how
  Phase 1 comes to overwrite a file the user put there. Whatever the user
  chooses and the project genuinely does not have goes to **Phase 1**, which
  installs the library, maps `DESIGN.md`'s values into it, and shows the mapping
  took effect. Naming a design system the repository does not contain is how
  Phase 4.x ends up styling against nothing.

If the harness cannot execute at all, stop and use `bdd-setup`. If the project
has no unit test framework, say so, agree one with the user, and record that it
was introduced rather than found.

**If any scenario here is tagged `@web` and none of the three is there, ask the
user before planning any UI phase.** Do not plan around it and do not invent a
look. Ask **which to add** rather than which one to pick - they compose - and say
what declining costs: the pages get built unstyled and no later phase catches
it, because the scenarios assert behaviour and pass on a page nobody could use.

Where two or three of them are present, they are used **together**: `DESIGN.md`
decides the values, the component library carries them, and a design plugin
composes the pages. A plugin that is installed but not enabled is present -
say so and ask whether to enable it, rather than recording it as absent.

The user may decline anyway. Record that in Phase 0 so it reads as a decision
rather than a gap nobody noticed.

An API-only or CLI feature needs no design system. Say that is why the table is
empty rather than leaving the reader to guess.

## 5. Point `.current` at it

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/current-plan.cjs --set docs/planning/<dir>
```

The plan just created is the one `/bdd:implement` should drive, and with one
plan per feature there will soon be several to choose between. Record the answer
on disk now rather than leaving the next command to work it out.

If this moved the pointer off an **unfinished** plan, name that plan and say it
is being put down. With a multi-feature suite this is the normal case - the
previous feature's plan is often still open - and it is a decision, not
bookkeeping.

## 6. Report

State, in the user's language:

- Where the plan is, and what its Phase 0 recorded.
- Which plan `.current` now names, and - when it moved off an unfinished one -
  which plan that was.
- The six commands, as resolved.
- The design system the plan will build against - which parts are `present` and
  which Phase 1 has to build - or why the feature needs none. Say which
  routes' layouts the **Page layout** table is waiting on, and that the design
  plugin is what fills them in Phase 4.x - a plan that names a designer and then
  never uses it is the failure this table exists to make visible.
- The baseline: how many scenarios are `green` / `red` / `blocked` /
  `undefined` right now.
- Anything Phase 0 could not resolve, named plainly.
- That `/bdd:implement` is what drives it from here, and that it pauses after
  each phase unless given `--auto`.

Do not start Phase 1. Planning ends at a filled Phase 0 that has been **moved to
`complete`** - `phase-status.cjs 0 complete` - with `## Next Step` rewritten to
name Phase 1. The template ships Phase 0 as `in_progress` because copying it
starts the phase; left that way the plan reports itself as still in setup for
the rest of its life, and nothing downstream notices.
