<!-- Prose is English here for legibility. In the real file, write the prose in
     the team's language. Headings, field names, paths, commands and pasted
     tool output stay as they are. -->

# Progress: <Task name>

What was actually run, and what it printed. Nothing here is a plan or an
intention - if a command was not run, it does not get a row.

Quote real output. Never write that something passed, deployed or applied
cleanly unless the output above it says so. This file is the only thing that
still proves the work after the context is gone and the commits are squashed.

## Sessions

| Date | Phases worked on | Ended at |
|---|---|---|
| `<YYYY-MM-DD>` | Phase <n> | <what was reached, or what blocked it> |

---

## Phase <n>: <title>

- **Status:** `in_progress`
- **Started:** `<YYYY-MM-DD>`

**What was done**

- <one line per action, concrete enough to repeat>

**Files created or changed**

- `<path>` - <what changed in it>

**Verification**

- **Command:** `<the command from this phase's Verifies line>`
- **Result:** <what it printed, in one line>

```
<paste the output that decides it - the plan summary, the test result, the
status check. Not the whole log; the part that carries the answer.>
```

- **What was checked for no-change:** <the things that were not supposed to
  move, and how that was confirmed>

If the verification could not be run here, say what is missing instead of
pasting nothing, and leave the phase `in_progress`:

- **Not verified because:** <credentials, a cluster, a device, a review - and
  who can run it>

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

## Task complete

- **Date:** `<YYYY-MM-DD>`
- **Goal reached:** <the observation that shows it - not the reasoning that
  suggests it>

```
<paste the final verification output>
```

- **Left undone:** <named here and in findings.md, or "nothing">
- **How to undo this:** <the rollback path, confirmed rather than assumed>

## Reboot check

Fill this in when resuming after a gap, before doing anything else.

| Question | Answer |
|---|---|
| Which phase is in hand? | `## Current Phase` in `task_plan.md` |
| What was the last thing actually run? | above, in this file |
| What is still unanswered? | `## Key Questions` in `task_plan.md` |
| What has been decided already? | `findings.md` |
