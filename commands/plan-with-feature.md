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
- No argument at all - list the feature files that have no plan yet and ask.

## 2. Check for an existing plan

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

If a plan for this feature is already open, do not create a second one. Report
where it is and what it says happens next, and offer `/bdd:implement` instead.
A finished plan for a feature that has since grown gets a **new dated
directory** - never reopen the old one.

## 3. Build the plan

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
  Phase 0.1 comes to overwrite a file the user put there. Whatever the user
  chooses and the project genuinely does not have goes to **Phase 0.1**, which
  installs the library, maps `DESIGN.md`'s values into it, and shows the mapping
  took effect. Naming a design system the repository does not contain is how
  Phase 3.x ends up styling against nothing.

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

## 4. Report

State, in the user's language:

- Where the plan is, and what its Phase 0 recorded.
- The six commands, as resolved.
- The design system the plan will build against - which parts are `present` and
  which Phase 0.1 has to build - or why the feature needs none.
- The baseline: how many scenarios are `green` / `red` / `blocked` /
  `undefined` right now.
- Anything Phase 0 could not resolve, named plainly.
- That `/bdd:implement` is what drives it from here, and that it pauses after
  each phase unless given `--auto`.

Do not start Phase 1. Planning ends at a filled Phase 0.
