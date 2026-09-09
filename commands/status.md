---
description: Show what the BDD planning files say is in progress - which feature is being driven, which scenario is in hand, what the next step is, and which plans need attention.
argument-hint: "[plan directory] [--root <dir>] [--stale-days <n>]"
---

# Planning status

Report the state of the plans the `implement` skill keeps under
`docs/planning/`: where each one is, what it says happens next, and what needs
attention.

This describes **what the plans record**. It does not run the suite, so it
cannot tell you what currently passes - a plan can be days out of date. For
what actually passes right now, use the `run` skill.

## 1. Read the plans

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs
```

With an argument, report that one plan in full - its goal, open questions and
every scenario in its queue:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/planning-status.cjs --plan docs/planning/<dir>
```

`--root <dir>` if the project keeps its plans somewhere else. `--stale-days <n>`
to change when an untouched plan starts warning (default 14).

If there are no plans at all, say so and stop. Suggest `implement` if the
project has feature files whose scenarios do not pass yet - do not create
anything here.

## 2. Report it in the user's language

Do not paste the script's output verbatim. Read it and say, in the language the
user is speaking:

- **Which plan is open**, and for a feature plan, which scenario is in hand and
  how many of its scenarios are green.
- **The next step** each open plan records.
- **What needs attention**, one line each, with what to do about it.

Keep tags, paths, commands and status values as they are.

## 3. Explain the warnings, do not just repeat them

| Warning | What it means | What to say |
|---|---|---|
| the feature file changed since this plan was made | The specification moved after the plan was made. The queue may no longer match the feature. | Settle it before more work goes in: either close this plan and open a new dated one against the new feature, or - if the edit was incidental - confirm that and re-fingerprint. Do not guess which scenarios moved. |
| no fingerprint recorded | Drift cannot be detected for this plan. | Record one now, and note that anything before this point was unchecked. |
| feature file is gone | The plan points at a file that no longer exists. | Ask whether it was renamed or deleted. Do not go looking for the closest match. |
| progress.md / findings.md is missing | The evidence or the decisions have no home. | Create it from the skill's template before continuing. |
| blocked on: ... | Something outside the plan is holding it up. | Repeat what it is and who resolves it. |
| nothing recorded for N days | The plan is open but nothing has been logged. | Ask whether it is still live. A plan nobody is working is worth closing. |
| no next step recorded | The plan cannot be resumed without re-reading everything. | Fill in `## Next Step` before doing anything else. |
| every phase is complete but not every scenario is green | The plan claims done while its own queue disagrees. | Trust the queue. Say the feature is not finished, and name the scenarios that are not green. |

## 4. Say what this cannot tell you

The queue states are whatever the last run recorded in the plan file. If a plan
has not been touched in days, its `green` rows are a claim about the past, not
about the working tree.

When the numbers matter - before a demo, a sign-off or a merge - say so, and
offer to run the suite with `run` to get the current answer instead.

## Keeping it honest

- Report the plans that exist. Never infer a plan for a feature that has none.
- A warning is not noise to summarise away. If a plan is drifted, blocked or
  stale, say so plainly, even when the user only asked what is next.
- Do not edit any planning file from this command. It reads; `implement`
  writes.
