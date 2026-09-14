<!-- Prose is English here for legibility. In the real file, write the prose -
     the goal, phase titles, the next step, questions - in the team's language.
     Headings, field names, status values, paths and commands stay English: the
     status script parses them. -->

# Task Plan: <Task name>

## Source

| Field | Value |
|---|---|
| Feature | `(none)` |
| Kind | <infrastructure / tooling / dependency upgrade / visual change / cleanup> |
| Started | `<YYYY-MM-DD>` |

`Feature: (none)` is what makes this a general plan rather than a BDD one. It
is a claim, and it has to be true.

**Before accepting it, check:** does this task change behaviour a user could
observe and a stakeholder could sign off on? If it does, it belongs in a
feature file and on the BDD plan - use `task_plan-bdd.md` instead. "It's only
a small change" and "it's just the UI" are the two sentences that most often
smuggle real behaviour past the specification.

This template is for work whose outcome is real but not a behaviour: standing
infrastructure up, moving a pipeline, upgrading a dependency, restyling a
screen without changing what it does, deleting dead code.

## Goal

<The end state, in one sentence. Written so that someone else could tell
whether it has been reached.>

## Next Step

<The single action that happens next. Rewrite it whenever a phase status
changes.>

## Current Phase

Phase <n>

## Phases

Three to seven phases, each one verifiable. The titles below are a starting
shape - replace them with this task's real phases. Status is `pending`,
`in_progress` or `complete`; nothing else.

Every phase carries a **Verifies** line: the command, check or observation that
decides whether it is done. A phase whose Verifies line reads "looks right" is
not a phase - work out what would actually show it, or merge it into another.

Every phase's `- [ ]` lines are ticked to `- [x]` as each check is observed,
while that phase is `in_progress` - not in a batch when its status changes. A
`complete` phase with an open box is a contradiction: either the check was
never made, or it was made and never written down.

### Phase 1: Understand and scope

- [ ] State what is being asked, and what is deliberately out of scope.
- [ ] Read what already exists before adding to it - the config, the callers,
      the shared helpers.
- [ ] Record constraints and unknowns in `findings.md`.
- **Verifies:** <what shows the scope is understood - e.g. the existing
  configuration is summarised in findings.md and matches what is deployed>
- **Status:** `pending`

### Phase 2: Decide the approach

- [ ] Choose the approach, and write down what was rejected and why.
- [ ] Name the blast radius: what breaks if this is wrong.
- [ ] Name how it gets undone.
- **Verifies:** <the decision and its rationale are in findings.md, and the
  rollback path has been stated concretely>
- **Status:** `pending`

### Phase 3: Implement

- [ ] Make the change in the smallest steps that can each be checked.
- [ ] Before writing code, read the **Development skills** the plugin's
      `README.md` lists for this stack, and record in `progress.md` what they
      changed. **"Read it, it changed nothing" is a different fact from never
      having opened it**, and only one of them can be checked later. A stack
      with no row in that table has no reference here - say so rather than
      applying one written for a different stack.
- [ ] Match the surrounding conventions, including the ones you disagree with.
- [ ] Touch only what the task needs.
- [ ] **If this task renders UI**, find what says how it should look before
      writing any of it. Check all three - they coexist, so finding one is not
      a reason to stop looking:
      a **UI/UX design plugin** (`ui-ux-pro-max` or its kind, and whether it
      has already written a spec), a **UI component library** (shadcn/ui, Ant
      Design, MUI, Bootstrap, Chakra, Mantine, Vuetify, an internal one - and
      where it keeps its tokens), and **`DESIGN.md`** (that exact filename, at
      the project root or under `docs/` - search for it rather than testing one
      path, and say where you looked if you conclude it is absent). Build against whatever is there, reading it in place; where
      two disagree on a value, a hand-written `DESIGN.md` wins. **If none of
      them is there, ask the user** rather than inventing a look - and say that
      declining means unstyled pages that no later check catches.
      **Whatever the user chooses to add needs a phase of its own**, before the
      first phase that renders anything: installing the library, mapping
      `DESIGN.md`'s values into it, and showing the mapping took effect is work,
      and a plan that only records the choice arrives at the rendering phase
      with nothing on disk to build against.
- **Verifies:** <the build, plan, lint or typecheck command for this stack, and
  its expected result>
- **Status:** `pending`

### Phase 4: Verify

- [ ] Run the verification named in the phases above, for real.
- [ ] Paste the actual output into `progress.md`.
- [ ] Check the things that were **not** meant to change did not change.
- **Verifies:** <the command that proves the goal was reached, and what its
  output has to say>
- **Status:** `pending`

Run it. Do not reason about what it would print. A change that was never
executed is not verified, however obviously correct it looks, and reporting it
as done is the failure this plugin exists to prevent.

If the verification cannot be run here - it needs credentials, a cluster, a
device, a review - say so plainly, name what is missing, and leave this phase
`in_progress`. An unverifiable phase is not a complete one.

### Phase 5: Deliver

- [ ] Everything above is `complete`, or its gap is named.
- [ ] Anything left undone is in `findings.md` under Gaps and deferred work.
- [ ] Report what was done, what was verified and how, and what was not.
- **Verifies:** <the final state, observed - not inferred>
- **Status:** `pending`

## Key Questions

Only questions that block the current phase. Answered ones move to
`findings.md` with their answer.

1. <question>

## Blocked On

Anything outside this plan that has to happen before the next step can. Empty
when nothing is blocking.

- <blocker, and who or what resolves it>

---

Where things go, so the three files do not drift into each other:

| This file | `progress.md` | `findings.md` |
|---|---|---|
| Which phase is now | What was actually run, and what it printed | What was learned and decided |
| The next single action | Errors, attempts, resolutions | Decisions, with reasons |
| Blocking questions | Verification evidence | Answered questions, gaps |
