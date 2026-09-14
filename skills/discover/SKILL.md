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
- **Keywords and tags stay English.** `Feature:`, `Scenario:`, `Given`/`When`/
  `Then` are syntax rather than prose; `@REQ-1042`, `@web`, `@wip` are keys the
  reports match on. Neither may shift with the prose. Keeping the keywords
  English also means no `# language:` header is needed, editor highlighting
  works, and every cucumber implementation is on its best-supported path:

  ```gherkin
  Feature: 购物车结账

    @REQ-1042 @web
    Scenario: 为单件商品下单
      Given 我的购物车中有 "ESP-100 浓缩咖啡杯"，单价 12.50 元
      When 我提交订单
      Then 订单总额为 42.50 元
  ```

- **Code and config stay English**: step definition bodies, file and directory
  names, commit messages, and any prompt sent to a model or subagent.
- **Talk to the user in the language they use** - their message language, or the
  language configured in their `CLAUDE.md`.
- **The repo wins when it disagrees.** If the project's existing feature files
  are in English, keep writing English and say why - a half-translated suite is
  worse than either language. If the existing files are inconsistent, ask which
  way the team wants to settle it.

`references/gherkin-style.md` carries the rest: which keyword to pick when Gherkin
offers synonyms (this suite always writes `Scenario:` and `Examples:`, never
`Example:` or `Scenarios:`), and what to do in a repo that already uses localized
keywords behind a `# language:` header.

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
  inventing new vocabulary (`node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs <features-root> --json bdd-artifacts/spec.json`
  gives the current inventory of features, scenarios, tags and requirement ids).
- Use realistic data, not `foo`/`bar`. Money, dates, ids and names should look
  like the domain's real values.
- Cover the unhappy paths. `references/discovery-questions.md` is the checklist:
  walk **every** category against every rule - actors and permissions, arrival and
  navigation, preconditions and state, data boundaries, outcomes, failure and
  recovery, time - not only the ones the requirement text happens to mention.
  Missing scenarios cluster in the categories nobody raised.
- **A screen that is not there yet needs an example for how a person reaches it**
  - not a note beside the other examples, an example, and one that clicks. It is
  the easiest behaviour in a requirement to leave out, because every other example
  reads as though you were already standing on the page. One green card settles it
  now; missed, it costs a second discovery round, and until somebody pays that the
  application has a screen only its tests can open.
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

If the breakdown introduces a screen, it has to say how a person arrives at it -
or say out loud that nothing links to it yet. Silence on this reads as complete
to everybody at the table, because nobody misses a question that was never asked.

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

Always run the parser over the **whole suite**, not just the file you wrote, and
fix every warning:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs <features-root> --json bdd-artifacts/spec.json
```

`<features-root>` is the directory from step 3 - `features/` on most stacks,
`src/test/resources/features/` on Java, `Features/` on .NET.

Pass the whole root rather than the new file because two of the checks are
suite-wide: a step sentence used as setup in one file and as an assertion in
another is just as unimplementable as the same collision inside one scenario, and
neither is visible while reading a single file.

The command prints feature/scenario/case/step counts, lists scenarios without a
requirement tag, and prints warnings on stderr. Treat every warning as a defect
in the feature file - a step-collision warning especially, because cucumber
matches step definitions on the text alone, so one definition would have to both
establish and check that state. The fix is wording, never a hook that branches on
the keyword; `references/gherkin-style.md` explains why under "One sentence, one
meaning".

Report the counts back to the user. If a scenario they asked for is missing from
the counts, say so - never claim completion from the file you wrote alone.

### 5. Offer the follow-ups

After the feature files are agreed, tell the user which next step applies. The
first three are the usual path; a feature file on its own is not yet runnable, so
do not send anyone to `run` until something has been built:

- Sign-off by people who do not read Gherkin -> `/bdd:spec-report` (HTML review document)
- The features put things on screen, and nobody has seen what it would look like
  -> `/bdd:sketch`, which derives every data state of every page from the
  scenarios and renders a wireframe board - before any code exists
- Build it -> `/bdd:plan-with-feature` to plan the work capability by capability,
  then `/bdd:implement` to drive it to green. No test harness in the project yet?
  `bdd-setup` (or `/bdd:bootstrap`) comes first, once per project.
- Implementation exists; run it and measure requirement coverage -> `run`
- Data model implied by the scenarios -> `export-ddl`; HTTP contract -> `/bdd:export-openapi`

## Working from a bug report

A bug is a missing example, not a new feature. Add the failing example to the
existing feature that owns the rule, tag it with the defect id
(`@BUG-1234 @regression`), and keep the requirement tag of the rule it violates
so coverage still attributes it to the original requirement.

## Anti-patterns to refuse

- **One sentence used for two meanings** - the same step text as setup in one
  place and as an assertion in another (`Given 清单是空的` … `Then 清单是空的`).
  Step 4's parser run flags these across the suite; give the assertion its own
  wording rather than arguing with the warning.
- **A feature that puts up a new screen and never says how anyone reaches it.**
  Every scenario passes while nothing but `page.goto` in a step definition ever
  opens the page. Add the arrival example, or record that the screen is
  deep-link-only - both are answers, and the missing question is not.
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
