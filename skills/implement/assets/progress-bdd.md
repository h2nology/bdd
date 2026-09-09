<!-- Prose is English here for legibility. In the real file, write the prose in
     the team's language. Headings, field names, tags, paths, commands and
     pasted tool output stay as they are. -->

# Progress: <Feature name>

What was actually run, and what it printed. Nothing here is a plan or an
intention - if a command was not run, it does not get a row.

Quote real output. Never write `PASS` for a test that was not executed, and
never summarise a failure you did not read. This file is the only thing that
still proves the work after the context is gone and the commits are squashed.

## Sessions

| Date | Capability worked on | Ended at |
|---|---|---|
| `<YYYY-MM-DD>` | `3.<n>` <name> | <phase, or what blocked it> |

## Baseline

Phase 0. Run once, before anything is driven.

- **Date:** `<YYYY-MM-DD>`
- **Command:** `<cucumber>`
- **Result:** <n passed, n failed, n undefined>

```
<paste the run summary>
```

Queue as observed: <n> `green`, <n> `red`, <n> `blocked`, <n> `undefined`.

Any placeholder Phase 0 could not resolve - `<unit-test>` on a project with no
framework, say - gets a row here saying so. A placeholder resolved later gets
its own dated addendum; do not edit this section to look as if it was known all
along.

---

## Phase 1: Outer RED

The whole feature at once.

- **Command:** `<cucumber-feature>`
- **Result:** <n failed, n blocked, n undefined>

```
<paste the failures, including the expected-vs-actual lines>
```

- **Step definitions written:** `<paths>`

Per scenario, as observed - not as hoped:

| Scenario | State | Why it is that state |
|---|---|---|
| `@REQ-<id>` | `red` | <which assertion failed, and what it printed> |
| `@REQ-<id>` | `blocked` | <which `Given` could not establish state, and which seam it needs> |

Each `blocked` row names a seam. Every one of those seams is now a row in the
Capability Queue - if it is not, this table is claiming a cause the plan does
not carry.

## Phase 2: Capabilities, and every failing test

The breakdown, and the tests that prove it. Both were written before any
production code.

| # | Phase | Capability | Needs | Test |
|---|---|---|---|---|
| 1 | `3.1` | <capability> | — | `<path::name>` |
| 2 | `3.2` | <capability> | 1 | `<path::name>` |

- **Command:** `<unit-test>`
- **Result:** <n tests, all n failed>

```
<paste, showing each test's expected-vs-actual line>
```

- **Skeletons created:** `<paths>` - <why each had to exist for its assertion
  to be reached at all, rather than the test failing on a missing module>

A skeleton is not behaviour. It exists so the failure is about the missing
behaviour instead of a missing file, and it is listed here so nobody later
mistakes it for work already done.

---

## Capability `3.<n>`: <name>

Repeat this block per capability, in queue order.

- **Phase 3.<n> - code:** `<paths>` - <what was added>
- **Command:** `<unit-test>`
- **This capability's test:** PASS
- **Everything else:** <n passed, n failed>

```
<paste the summary>
```

- **Still failing, and why that is expected:** <the capabilities not yet built,
  checked against the queue. A failure that is not on that list is a
  regression, and it goes in the Errors table.>

A capability whose test was never seen failing is not a capability. If its test
was written or changed during this phase rather than in Phase 2, say so here
with the reason - a test written after the code it checks proves nothing about
whether the code was needed.

---

## Phase 4: All units green

- **Command:** `<unit-test>`
- **Result:** <n passed, 0 failed, 0 skipped>

```
<paste the summary>
```

- **Count against the queue:** <n> rows, <n> passing tests, plus <n> the
  project already had.
- **Tests deleted, skipped or loosened since Phase 2:** <none, or each one with
  the reason>

## Phase 5: Outer GREEN

- **Feature:** `<cucumber-feature>` -> PASSED

```
<paste>
```

- **Whole suite:** `<cucumber>` -> <n passed, 0 failed>

```
<paste the summary line>
```

- **Commit:** `<sha>` <subject>

## Phase 6: Refactor

- **What changed:** <duplication removed, names improved - or "none needed">
- **Units after:** `<unit-test>` -> <n passed, 0 failed>
- **Suite after:** `<cucumber>` -> <n passed, 0 failed>
- **Commit:** `<sha>` <subject>

---

## Errors

Every error that cost more than one attempt. The point is not bookkeeping - it
is that attempt 2 must not be attempt 1 again.

| Date | Error | Attempt | What was changed for the next attempt | Resolved |
|---|---|---|---|---|
| `<YYYY-MM-DD>` | <error, quoted> | 1 | <the fix tried> | <yes / no> |

After three failed attempts on the same error, stop and ask. Say what was
tried, quote the actual error, and name what is unclear. Do not open a fourth
attempt on your own.

## Predictions that were wrong

Writing every test in Phase 2 means betting on interfaces that do not exist
yet. Some of those bets lose. Each one gets a row - not a silent edit.

| Date | What was predicted | What turned out to be true | What changed |
|---|---|---|---|
| `<YYYY-MM-DD>` | <the test, and the interface it assumed> | <what the code needed instead> | <the test's new shape> |

## Feature complete

- **Date:** `<YYYY-MM-DD>`
- **Every scenario green:** `<cucumber>` -> <n passed, 0 failed>
- **Every capability done:** <n>/<n>
- **Coverage:** `<coverage>` -> <requirement coverage figures>
- **Left undone:** <named here and in findings.md, or "nothing">
- **Still assumed, unconfirmed:** <every `assumed - unconfirmed` row in
  findings.md, repeated here - or "none">

## Reboot check

Fill this in when resuming after a gap, before doing anything else.

| Question | Answer |
|---|---|
| Which capability is in hand? | `## Current Capability` in `task_plan.md` |
| Which phase is it in? | `task_plan.md` |
| Which capabilities are done? | `## Capability Queue` in `task_plan.md` |
| What was the last thing actually run? | above, in this file |
| What is still unanswered? | `## Key Questions` in `task_plan.md` |
| What has been decided already? | `findings.md` |
