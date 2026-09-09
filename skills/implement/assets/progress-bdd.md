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

| Date | Scenarios worked on | Ended at |
|---|---|---|
| `<YYYY-MM-DD>` | `@REQ-<id>` | <phase, or what blocked it> |

## Baseline

Phase 0. Run once, before any scenario is driven.

- **Date:** `<YYYY-MM-DD>`
- **Command:** `<cucumber>`
- **Result:** <n passed, n failed, n undefined>

```
<paste the run summary>
```

Queue as observed: <n> `green`, <n> `red`, <n> `undefined`.

---

## Scenario: `@REQ-<id>` <name>

### Phase 1: Outer RED

- **Command:** `<cucumber-one>`
- **Result:** FAILED on assertion

```
<paste the failure, including the expected-vs-actual line>
```

- **Why this counts as RED:** <one sentence: which behaviour is missing, and
  why the failure is not a typo, a broken fixture or an unrelated regression>
- **Step definitions written:** `<path>`

### Phase 2: Units

The breakdown, in the order it will be built. `Needs` is what each one cannot
be built before.

| # | Unit | Needs |
|---|---|---|
| 1 | <unit> | - |
| 2 | <unit> | 1 |

#### Unit 1: <name>

- **Phase 3 - unit RED:** `<unit-test>` -> FAIL

```
<paste the failure, with its expected-vs-actual line>
```

- **Phase 4 - code:** `<path>` - <what was added>
- **Phase 5 - unit GREEN:** `<unit-test>` -> PASS, <n> tests, 0 failed

Repeat this block per unit. A unit whose RED was never seen is not a unit -
record what happened in the Errors table rather than filling these three lines
from memory. The point of keeping them as three lines is that each was observed
before the next began; written together afterwards, they prove nothing.

### Phase 6: Outer GREEN

- **Scenario:** `<cucumber-one>` -> PASSED

```
<paste>
```

- **Whole suite:** `<cucumber>` -> <n passed, 0 failed>

```
<paste the summary line>
```

- **Commit:** `<sha>` <subject>

### Phase 7: Refactor

- **What changed:** <duplication removed, names improved - or "none needed">
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

## Feature complete

- **Date:** `<YYYY-MM-DD>`
- **Every scenario green:** `<cucumber>` -> <n passed, 0 failed>
- **Coverage:** `<coverage>` -> <requirement coverage figures>
- **Left undone:** <named here and in findings.md, or "nothing">

## Reboot check

Fill this in when resuming after a gap, before doing anything else.

| Question | Answer |
|---|---|
| Which scenario is in hand? | `## Current Scenario` in `task_plan.md` |
| Which phase is it in? | `task_plan.md` |
| What was the last thing actually run? | above, in this file |
| What is still unanswered? | `## Key Questions` in `task_plan.md` |
| What has been decided already? | `findings.md` |
