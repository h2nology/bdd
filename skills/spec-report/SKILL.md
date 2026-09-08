---
name: spec-report
description: This skill should be used when Gherkin feature files must be turned into a human-readable HTML document for review or sign-off - for example "generate an HTML report from the feature files", "make a spec document for the manager", "export the scenarios for review", "show the requirement traceability matrix", "which requirements have no scenarios", or when a stakeholder who does not read code needs to approve the specified behaviour.
---

# Gherkin to reviewable HTML specification report

Turn the `.feature` files in a project into one self-contained HTML document
with a requirement traceability matrix, so a product owner or manager can review
and sign off the specified behaviour without reading the repository.

This report describes **what is specified**, not what passed. For execution
results and coverage percentages use the `run` skill / `coverage.cjs` instead.

## Communication policy

- Run the tooling and write commit messages in English.
- Report progress and findings to the user in the language they use.
- The report chrome (headings, table headers) is localized with `--labels`; pick
  the **reviewer's** language, which is often not the developer's. Ask if unclear.
  Supported: `en`, `zh-CN`, `zh-TW`, `ja`. The Gherkin content itself is always
  shown verbatim.

## Generate the report

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs features/ \
  --out bdd-artifacts/spec-report.html \
  --json bdd-artifacts/spec-report.json \
  --title "Checkout - specification for review" \
  --labels zh-CN
```

Options:

| Option | Effect |
|---|---|
| `[paths...]` | Feature files or directories. Defaults to `features/`, `src/test/resources/features/`, `Features/`, `tests/features/`, then `.` |
| `--out <file>` | Output HTML (default `bdd-artifacts/spec-report.html`) |
| `--json <file>` | Structured model: stats, requirement index, per-scenario records |
| `--title <text>` | Document title; use the capability under review, not "Report" |
| `--labels <tag>` | Report chrome language: `en` \| `zh-CN` \| `zh-TW` \| `ja` |
| `--req-prefix <p>` | Extra requirement tag prefix, repeatable (`--req-prefix PAY`) |
| `--no-steps` | Summary only - inventory and traceability without step detail |

The output is a single HTML file with no external assets: it opens offline, and
prints cleanly to PDF (`Cmd/Ctrl+P`) for stakeholders who want a document.

Exit codes: `0` report written (parse warnings do not change this - they are
printed on stderr and listed in the report), `2` no feature files found at the
given paths.

## What the report contains

1. **Summary cards** - features, rules, scenarios, cases (outline rows counted
   individually), steps, distinct requirement ids.
2. **Requirement traceability** - every requirement id with the scenarios that
   cover it and their file:line.
3. **Scenarios without a requirement tag** - the review gap list. Anything here
   is behaviour nobody can trace to a requirement.
4. **Tag index** - counts per tag, so `@wip`, `@manual` and `@flaky` volumes are visible.
5. **Full Gherkin** - each feature with description, background, rules,
   scenarios, data tables, doc strings and example tables.
6. **Parse warnings** - malformed Gherkin. Never hand over a report that still
   lists warnings; fix the feature files first.

## Procedure

1. Locate the feature files. If the project has none, stop and offer
   `discover` (write scenarios) or `init` (set the harness up).
2. Ask which language the report chrome should use if the reviewer's language is
   not already known, and what the document should be titled.
3. Run the command. Read the console summary; it prints counts, untagged
   scenarios and parse warnings.
4. **Report the numbers to the user before claiming success**: features,
   scenarios, cases, requirement ids, untagged scenarios, warnings. If warnings
   exist, fix the Gherkin (see `discover`) and re-run.
5. Tell the user the output path, and mention that the file is print-to-PDF ready.
6. If an `Artifact` tool is available in the session and the user wants a link to
   share with reviewers, offer to publish the HTML as an artifact. Do not publish
   without asking - a specification is internal content.

## Review checklist to hand to the stakeholder

Read `references/review-checklist.md` and include the relevant points in the
message to the user. The short version, in the reviewer's language:

- Does every scenario describe behaviour you actually want?
- Is anything in the "no requirement tag" list something you asked for?
- Which requirements from your backlog are missing from the matrix entirely?
- Are the example values realistic for production data?
- Which scenarios are `@manual` - do you accept that they will not be checked automatically?

## Keeping the report honest

- Regenerate after every change to the feature files; a stale report is worse
  than none. Wire it into CI or a pre-review script if the team reviews often.
- Commit the `--json` model, not the HTML, when the team wants to diff spec
  changes across releases: it is stable and reviewable.
- The report counts what is *written*. A scenario tagged `@wip` still appears;
  say so when handing the report over, or filter those files out of the paths.

## Reference files

- `references/review-checklist.md` - what a stakeholder should look for, and the sign-off record format
