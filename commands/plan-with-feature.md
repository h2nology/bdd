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
- **A `@web` feature names what says how its pages should look.** Check all
  three - a design plugin like `ui-ux-pro-max`, a UI component library, a
  `DESIGN.md` at the project root - and record every one that is there in
  Phase 0, with its path.

If the harness cannot execute at all, stop and use `bdd-setup`. If the project
has no unit test framework, say so, agree one with the user, and record that it
was introduced rather than found.

**If any scenario here is tagged `@web` and none of the three is there, ask the
user before planning any UI phase.** Do not plan around it and do not invent a
look. Offer the three - install a component library, write a `DESIGN.md`, have a
design plugin generate one - and say what declining costs: the pages get built
unstyled and no later phase catches it, because the scenarios assert behaviour
and pass on a page nobody could use.

The user may decline anyway. Record that in Phase 0 so it reads as a decision
rather than a gap nobody noticed.

An API-only or CLI feature needs no design system. Say that is why the table is
empty rather than leaving the reader to guess.

## 4. Report

State, in the user's language:

- Where the plan is, and what its Phase 0 recorded.
- The six commands, as resolved.
- The design system the plan will build against, or why the feature needs none.
- The baseline: how many scenarios are `green` / `red` / `blocked` /
  `undefined` right now.
- Anything Phase 0 could not resolve, named plainly.
- That `/bdd:implement` is what drives it from here, and that it pauses after
  each phase unless given `--auto`.

Do not start Phase 1. Planning ends at a filled Phase 0.
