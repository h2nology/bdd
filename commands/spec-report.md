---
description: Turn the project's Gherkin feature files into a single-file HTML specification report with a requirement traceability matrix, for stakeholder review and sign-off.
argument-hint: "[feature paths] [--lang en|zh-CN|zh-TW|ja|ko]"
---

# Specification report

Render the `.feature` files in this project as one self-contained HTML document a
product owner or manager can review and sign off without opening the repository.

This describes **what is specified**, not what passed. For execution results and
coverage percentages use the `run` skill instead.

Arguments the user gave: `$ARGUMENTS`

## 1. Find the feature files

If the user named paths, use them. Otherwise let the parser fall back to its usual
roots (`features/`, `src/test/resources/features/`, `Features/`, `tests/features/`).

If the project has none, stop and offer `discover` (write scenarios) or `init` (set
up the harness) instead of producing an empty report.

## 2. Parse into the structured model

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs <paths> --json bdd-artifacts/spec-report.json
```

Read the console summary: feature/scenario/case/step counts, the named list of
scenarios with no requirement tag, and any parse warnings on stderr.

**Parse warnings are defects in the feature files.** If any appear, fix the Gherkin
first (see `discover`) and re-run — a report that ships with warnings tells the
reviewer the specification is malformed, which is not something they can sign.

## 3. Settle two things with the user

Unless the request already names them:

- **`lang`** — the report chrome's language. Pick the **reviewer's** language,
  which is often not the developer's. The Gherkin content itself is always
  reproduced verbatim whatever this is set to.
- **The document title** — name the capability under review ("Checkout —
  specification for review"), never "Report".

The theme needs no question: `notion` is the only first-party theme.

## 4. Render

Invoke the `html-report` skill with `mode=spec`, passing the JSON model from step 2
plus the feature files themselves — the JSON carries the inventory, the Gherkin
carries the prose. That skill's `spec` mode section documents the field mapping,
the anchor convention for the scenario index, and the rule that step text is
never translated.

Default output path: `bdd-artifacts/spec-report.html`.

## 5. Report the numbers before claiming success

Give the user, in their language:

1. Features, scenarios, cases, steps, distinct requirement ids.
2. Scenarios carrying no requirement tag — behaviour nobody can trace to a
   requirement, and the most actionable thing in the report.
3. Requirements from their backlog missing from the matrix entirely, if a backlog
   is available (`docs/requirements.md`).
4. Parse warnings, and confirmation that none remain.
5. The output path, and that the file opens offline and prints cleanly to PDF.

Never claim completion from the file you wrote alone — if a scenario the user asked
about is missing from the counts, say so.

## 6. Hand over a review checklist

Read `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md` and include the relevant
points in your message, in the reviewer's language. The short version:

- Does every scenario describe behaviour you actually want?
- Is anything in the "no requirement tag" list something you asked for?
- Which requirements from your backlog are missing from the matrix entirely?
- Are the example values realistic for production data?
- Which scenarios are `@manual` — do you accept they will not be checked automatically?

## Keeping it honest

- Regenerate after every change to the feature files; a stale report is worse than
  none.
- Commit the `--json` model rather than the HTML when the team wants to diff spec
  changes across releases: it is stable and reviewable.
- The report counts what is *written*. A `@wip` scenario still appears — say so when
  handing it over, or filter those paths out.
- If an `Artifact` tool is available and the user wants a link to share with
  reviewers, offer to publish the HTML. Do not publish without asking — a
  specification is internal content.
