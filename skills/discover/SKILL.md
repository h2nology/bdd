---
name: discover
description: This skill should be used when the user wants to turn a requirement, user story, feature idea, change request, or bug report into Gherkin - for example "write a feature file for this", "break this requirement into scenarios", "do BDD on this requirement", "run example mapping", "refine these acceptance criteria", "turn this ticket into cucumber scenarios", or when a one-line requirement must be mined into rules, examples and open questions before any code is written.
---

# Requirement discovery to Gherkin

Mine a thin requirement into rules, concrete examples and open questions, then
express the agreed behaviour as `.feature` files that the rest of this plugin
can report on, execute and trace.

## Communication policy

The line is drawn at **who reads it**, not who wrote it.

- **The prose in a feature file follows the user's language.** Feature, rule and
  scenario names, descriptions, step text and `Examples` table headers are
  written in the language the team speaks. This is the whole point of the
  format: the people who own the requirement have to be able to read it back and
  say "no, that rule is wrong". A specification in a language its reviewers do
  not read cannot do that job.
- **Keywords stay English.** `Feature:`, `Rule:`, `Background:`, `Scenario:`,
  `Scenario Outline:`, `Examples:`, `Given`, `When`, `Then`, `And`, `But`. They
  are syntax, not prose - and keeping them English means no `# language:` header
  is needed, editor highlighting works, and every cucumber implementation is on
  its best-supported path:

  ```gherkin
  Feature: 购物车结账

    @REQ-1042 @web
    Scenario: 为单件商品下单
      Given 我的购物车中有 "ESP-100 浓缩咖啡杯"，单价 12.50 元
      When 我提交订单
      Then 订单总额为 42.50 元
  ```

  Some of these have synonyms - `Example:` for `Scenario:`, `Scenarios:` for
  `Examples:` - and the suite uses neither: always `Scenario:`, including inside
  a `Rule:`, and always `Examples:` for an outline's data table.
  `references/gherkin-style.md` has the table.

  Localized keywords are still parsed (`en`, `zh-CN`, `zh-TW`, `ja`). If the repo
  already uses them, follow it and keep the `# language:` header; do not start a
  new suite that way.
- **Tags stay English.** `@REQ-1042`, `@web`, `@wip`, `@regression` are keys the
  reports match on; they must not shift with the prose.
- **Code and config stay English**: step definition bodies, file and directory
  names, commit messages, and any prompt sent to a model or subagent.
- **Talk to the user in the language they use** - their message language, or the
  language configured in their `CLAUDE.md`.
- **The repo wins when it disagrees.** If the project's existing feature files
  are in English, keep writing English and say why - a half-translated suite is
  worse than either language. If the existing files are inconsistent, ask which
  way the team wants to settle it.

## Workflow

Do not skip step 1. A requirement that goes straight to Gherkin produces
scenarios that encode the assistant's assumptions instead of the team's rules.

### 1. Mine the requirement (Example Mapping)

Read `references/example-mapping.md` and produce the four-colour breakdown:

| Card | Meaning | Output |
|---|---|---|
| Story (yellow) | The requirement under discussion | one line |
| Rule (blue) | A business rule that constrains it | one line each |
| Example (green) | A concrete case that illustrates a rule | one line each, with real data |
| Question (red) | An unknown that blocks an example | one line each |

Rules for this step:

- Derive rules from the requirement text, the existing feature files, and the
  code if it already exists. Search the repo for related features before
  inventing new vocabulary (`node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs features/ --json bdd-artifacts/spec.json`
  gives the current inventory of features, scenarios, tags and requirement ids).
- Use realistic data, not `foo`/`bar`. Money, dates, ids and names should look
  like the domain's real values.
- Cover the unhappy paths: boundary values, permissions, empty and maximal
  states, concurrency, and error recovery. Ask `references/discovery-questions.md`
  for the checklist.
- Every red question is a **blocking unknown**. Collect them in one batch (use
  `AskUserQuestion` when the answers change the scenarios). Step 2 decides what
  becomes of the ones nobody answers - do not resolve them by guessing here.

### 2. Put the breakdown in front of the user before writing files

Show the story / rules / examples / questions list in the user's language and
ask for corrections. This is cheap now and expensive later: once a rule is in a
`.feature` file it also lives in the step definitions, in the coverage report,
and in whatever the team builds against it. A wrong rule caught at this stage
costs one line; the same rule caught after implementation costs three files and
an argument about which one is right.

What matters is the **order**, not the waiting. If the user is there and a rule
is disputed, settle it before writing. If nobody can answer - a batch run, an
explicit "just do it", questions that came back unanswered - that does not
cancel this step, it changes its ending: still show the breakdown first, then
write the files with every unanswered question restated as an assumption at the
**top** of what you hand back. An assumption the reader meets only after they
have already accepted the scenarios has disclosed nothing.

### 3. Write the feature files

- Follow `references/gherkin-style.md` (one behaviour per scenario, declarative
  step text, no UI mechanics in step text unless the requirement is about the UI).
- Follow `references/tagging.md` for requirement ids. **The traceability in the
  `run` skill and the `/bdd:spec-report` command depends on these tags being right.**
- Put files where the language stack expects them (see the `bdd-setup` skill, or
  reuse the existing location in the repo):
  - TypeScript/JavaScript: `features/`
  - Java: `src/test/resources/features/`
  - Python: `features/` or `tests/features/`
  - C#/.NET: `Features/`
- One feature file per capability, not per screen. Use `Rule:` blocks when a
  feature has several independent business rules.
- A capability delivered on both the website and the mobile app belongs in **one**
  feature file. Write the behaviour once, then tag the lane-specific scenarios
  `@web` / `@mobile` (see `references/tagging.md`). Gherkin is driver-agnostic:
  the web lane runs it through Playwright, the mobile lane through Appium.
- Reuse existing step phrasings verbatim where they already exist, so step
  definitions stay shared. Grep the step definition directory before inventing
  a new phrasing.

Template: `assets/feature-template.feature`.

### 4. Validate what was written

Always run the parser over the new files and fix every warning:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs features/ --json bdd-artifacts/spec.json
```

The command prints feature/scenario/case/step counts, lists scenarios without a
requirement tag, and prints parse warnings on stderr. Treat any warning as a
defect in the feature file, and report the counts back to the user.

The parser cannot see one defect, so check it by hand: **no step sentence may
appear both as setup and as an assertion.** Resolve `And`/`But` to the keyword
they inherit, then intersect the setup sentences (`Given`, `Background`) with
the `Then` sentences - the result has to be empty. A collision here is not
cosmetic: it cannot be implemented at all, because cucumber matches step
definitions on the text alone. If a
scenario the user asked for is missing from the counts, say so - never claim
completion from the file you wrote alone.

### 5. Offer the follow-ups

After the feature files are agreed, tell the user which next step applies:

- Manager-ready HTML review document -> the `/bdd:spec-report` command
- No test harness in the project yet -> `bdd-setup`
- Harness exists, run and measure -> `run`
- Data model implied by the scenarios -> `export-ddl`

## Working from a bug report

A bug is a missing example, not a new feature. Add the failing example to the
existing feature that owns the rule, tag it with the defect id
(`@BUG-1234 @regression`), and keep the requirement tag of the rule it violates
so coverage still attributes it to the original requirement.

## Anti-patterns to refuse

- **One sentence used for two meanings** - the same step text as setup in one
  place and as an assertion in another (`Given 清单是空的` … `Then 清单是空的`).
  Cucumber matches on the text alone, so a single step definition would have to
  both establish and check the state. Give the assertion its own wording; see
  "One sentence, one meaning" in `references/gherkin-style.md`.
- Scenarios that assert on implementation detail (SQL, class names, HTTP status
  codes) when the requirement is about business behaviour.
- One scenario with ten `When` steps: split it, one behaviour per scenario.
- `Scenario Outline` used to smuggle unrelated cases into one table; an outline
  is for the *same* behaviour with different data.
- Incidental setup repeated in every scenario: move it to `Background`, and keep
  `Background` free of assertions.
- Feature files with no requirement tag: they cannot be traced or reported on.

## Reference files

- `references/example-mapping.md` - the discovery session format and how to run it solo
- `references/discovery-questions.md` - the question checklist that finds missing scenarios
- `references/gherkin-style.md` - Gherkin style rules, keyword semantics, data tables, outlines
- `references/tagging.md` - requirement id, layer and lifecycle tag conventions used by the reports
