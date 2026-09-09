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

### Phase 1: Understand and scope

- [ ] State what is being asked, and what is deliberately out of scope.
- [ ] Read what already exists before adding to it - the config, the callers,
      the shared helpers.
- [ ] Record constraints and unknowns in `findings.md`.
- **Verifies:** <what shows the scope is understood - e.g. the existing
  configuration is summarised in findings.md and matches what is deployed>
- **Status:** `in_progress`

### Phase 2: Decide the approach

- [ ] Choose the approach, and write down what was rejected and why.
- [ ] Name the blast radius: what breaks if this is wrong.
- [ ] Name how it gets undone.
- **Verifies:** <the decision and its rationale are in findings.md, and the
  rollback path has been stated concretely>
- **Status:** `pending`

### Phase 3: Implement

- [ ] Make the change in the smallest steps that can each be checked.
- [ ] Match the surrounding conventions, including the ones you disagree with.
- [ ] Touch only what the task needs.
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
