# bdd - Behaviour-Driven Development plugin for Claude Code

Take a one-line requirement to working, traceable code: mine it into Gherkin,
review it as an HTML document, scaffold cucumber + Playwright in the project's
language, give the UI work a design system to build against, drive each scenario
to green with outside-in TDD, run the suite and read what it reports, derive a
page flow map from the run's screenshots, and generate database DDL from the
same specs.

## Install

```
/plugin marketplace add h2nology/h2nology-marketplace
/plugin install bdd@h2nology
```

## Skills

| Skill | Use it for |
|---|---|
| `discover` | Mine a requirement, story, or bug into rules, examples and questions, then write `.feature` files |
| `bdd-setup` | Set up (or repair) a cucumber harness in TypeScript/JavaScript, Java, Python or C#/.NET - Playwright for web, Appium for mobile |
| `planning` | Keep the plan, the evidence and the decisions on disk - `task_plan.md`, `progress.md`, `findings.md` per plan, for feature work and for work with no feature file |
| `run` | Execute the suite, report what passed, what never ran and what has no step definition, and triage failures |
| `flow-map` | Turn per-step screenshots into a page (web) or screen (mobile) transition diagram, transition table and screenshot gallery |
| `export-ddl` | Derive a data model from the scenarios and emit DDL for PostgreSQL, MySQL, Oracle, SQL Server or SQLite |
| `export-openapi` | Derive an HTTP contract from the scenarios, or report which documented operations no scenario covers |
| `html-report` | Render a report as one self-contained HTML file; its `spec` mode backs the specification report |

Each is invocable as `/bdd:<name>` and triggers automatically from a matching
request. Use the namespaced form: the plugin's `run` shares its bare name with
Claude Code's built-in `/run`, so `/bdd:run` is what reaches this plugin.

## Development skills

Stack-specific guidance, read **while writing code** - React, Vue, Nuxt and
React Native today, other stacks as they are added. These are not part of the
BDD loop and no phase runs them: they are references the code in hand either
needs or does not.

`references/development-skills.md` is the table - which skill applies to which
stack, and what each one carries. Both task plan templates and `/bdd:implement`
point at that file rather than at any skill in it, because this plugin drives
TypeScript, Java, Python and .NET and a phase naming one stack's guidance would
be wrong for the other three. Adding a reference for another stack is an edit to
that one table.

## Commands

| Command | Use it for |
|---|---|
| `/bdd:bootstrap` | Set a project up for BDD: the cucumber harness that can execute feature files - `bdd-setup` |
| `/bdd:spec-report` | Turn the feature files into an HTML specification report with a requirement traceability matrix, for stakeholder review and sign-off |
| `/bdd:sketch` | Derive the UI the feature files imply - every data state of each page, with a callout beside it saying what each button and link does and which scenario says so - and render it as a read-only wireframe board, before any code exists |
| `/bdd:status` | Show what the planning files say is in progress: which feature is being driven, which capability is in hand, what happens next, and which plans need attention |
| `/bdd:plan-with-feature` | Plan one feature file's implementation: the dated planning directory, this project's six test commands, and a scenario queue filled from a real baseline run |
| `/bdd:plan` | Plan work that has no feature file - infrastructure, an upgrade, a cleanup - as phases with a verification for each |
| `/bdd:implement` | Drive an existing plan forward. Pauses after every phase by default; `--auto` runs straight through |

A command runs only when you type it. `spec-report` parses, confirms the
reviewer's language and theme, and renders through `html-report`; `status` reads
the plans and reports them; `bootstrap` runs `bdd-setup` and says what comes
after it. None of the three decides anything, so none needs to be a skill.

`sketch` is a command for a different reason: deriving a UI from Gherkin is very
much a judgement call, but you ask for a board when you want one. The line is
not "does it decide things" - it is whether the model should reach for it
mid-task. It should reach for `discover` or `planning`; it should not decide on
its own that your feature needs wireframing.

**Planning and building are split on purpose.** The `planning` skill owns the
files on disk and is safe to trigger mid-task - "what was I working on" should
reach it. Writing code against a plan is not: `/bdd:implement` moves your
working tree, so it runs when you ask for it and stops after each phase unless
you pass `--auto`. That default is the point of the split - a phase boundary is
where the evidence has just been written and is cheapest to disagree with.

**The design system is decided and built inside the plan, not at bootstrap.** A
project either already has something that says how its pages should look - a
design plugin like `ui-ux-pro-max`, a UI component library, a `DESIGN.md` - or
it has to decide, and that decision is the user's.

So the check lives in the plan. `plan-with-feature` records every source the
project has, and asks which to add when a `@web` feature has none. That is the
first point where the question is answerable at all: before the feature files
exist, nothing can tell whether the project has `@web` scenarios, or what
product the pages would serve.

Whatever the user chooses and the project lacks is then built by **Phase 1**
of that plan, driven like every other phase: the component library installed,
`DESIGN.md`'s values mapped into it, the mapping shown to have taken effect.
Recording the choice and building it are two different things, and a plan that
does only the first reaches Phase 4.x with nothing on disk to style against.

**What the design system is not.** It says what the pages should look like;
nothing checks that they do. The scenarios assert behaviour, so they go green on
an unstyled page just as happily as on a finished one. Treat it as the spec the
implementation loop builds against, not as a gate that catches you ignoring it.

## Typical flow

```
requirement
  -> /bdd:discover      features/*.feature
  -> /bdd:spec-report   bdd-artifacts/spec-report.html   (stakeholder sign-off)
  -> /bdd:bootstrap     harness                          (once per project)
  -> /bdd:sketch        bdd-artifacts/sketch.html        (what it would look like)
  -> /bdd:plan-with-feature  docs/planning/<date>-<feature>/  (the plan, and a real baseline)
       @web and nothing says how the pages should look? -> it asks you
  -> /bdd:implement     the code                          (capability by capability, to green)
  -> /bdd:run           bdd-artifacts/cucumber.html      (what is verified)
  -> /bdd:flow-map      bdd-artifacts/flow-map.html      (which screens were exercised)
  -> /bdd:export-ddl    migrations/                       (schema implied by the specs)
  -> /bdd:export-openapi openapi.yaml                     (HTTP contract implied by the specs)
```

## Bundled scripts

Zero-dependency Node.js (`.cjs`, no `npm install`, no `node_modules`) so they run
inside Java, Python and .NET projects too. Node 14+.

| Script | Purpose |
|---|---|
| `scripts/spec-report.cjs` | Gherkin -> HTML specification report + JSON model |
| `scripts/sketch.cjs` | Sketch spec JSON -> wireframe canvas (pan/zoom board, state-variant groups, action callouts leader-lined to their control) |
| `scripts/flow-map.cjs` | Step captures -> Mermaid page flow diagram, transition table, gallery |
| `scripts/openapi.cjs` | Gherkin -> stated HTTP operations + inferred schemas; and OpenAPI operation coverage |
| `scripts/planning-status.cjs` | Planning files -> what is in progress, and which plans have drifted, stalled or blocked |
| `scripts/phase-status.cjs` | Set one phase's status in a plan - validated, locked, atomic |
| `scripts/current-plan.cjs` | Read and move `docs/planning/.current`, the pointer at the plan being driven |
| `scripts/lib/gherkin.cjs` | Gherkin parser (dialects: `en`, `zh-CN`, `zh-TW`, `ja`) |
| `scripts/lib/results.cjs` | Reads cucumber messages ndjson, legacy cucumber JSON, or JUnit XML |
| `scripts/lib/labels.cjs` | Localized report chrome |
| `scripts/lib/util.cjs` | Shared helpers and report CSS |

Run any of them directly:

```bash
node scripts/spec-report.cjs features/ --out out.html --labels zh-CN
node scripts/flow-map.cjs --input bdd-artifacts/flow --out out.html
node scripts/openapi.cjs extract features/ --json extract.json
node scripts/openapi.cjs coverage features/ --spec openapi.yaml --out cov.html
node scripts/planning-status.cjs --root docs/planning
node scripts/current-plan.cjs --set docs/planning/2026-09-08-checkout
```

## Conventions the whole plugin shares

**Requirement tags** drive all traceability. Tag scenarios with `@REQ-1042`
(`REQ`, `REQUIREMENT`, `US`, `STORY`, `JIRA`, `ISSUE`, `TICKET`, `AC` prefixes are
recognized; add more with `--req-prefix`). A requirement backlog file lets the
coverage report detect requirements that have **no** scenario at all.

**Environment contract** for every language stack: `BDD_BASE_URL`,
`BDD_DRIVER` (`playwright` \| `appium`), `BDD_BROWSER`, `BDD_HEADED`,
`BDD_SLOWMO`, `BDD_DEVICE`, `BDD_TIMEOUT`, `BDD_FLOW_CAPTURE`, `BDD_FLOW_DIR`,
`BDD_TRACE` - plus the mobile-lane set (`BDD_PLATFORM`, `BDD_APPIUM_URL`,
`BDD_DEVICE_NAME`, `BDD_APP`, ...) defined in
`skills/bdd-setup/references/appium.md`.

**Design system**, for the web lane: three things can say how a page should
look - a design plugin like `ui-ux-pro-max`, a UI component library, or a
`DESIGN.md` (that exact filename, at the root or under `docs/`) - and they
**coexist**. A `DESIGN.md` defining
tokens beside a library supplying components is a normal pairing, not a conflict
to resolve. Each stays in its own format and is read in place; nothing is copied
into a second file and nothing is compiled. Precedence only arises where two of
them define the same value, and then the hand-written `DESIGN.md` wins and the
override is reported. `plan-with-feature` records what it finds in Phase 0 with
a `State` per source, asks the user which to add when a `@web` feature has none
of the three, and leaves Phase 1 to build whatever is missing.

**Artifacts** all land in `bdd-artifacts/` (git-ignore it).

**Planning files** are the exception, and go in `docs/planning/<date>-<slug>/` -
`task_plan.md`, `progress.md` and `findings.md`, one set per feature. They are
committed, not ignored: `bdd-artifacts/` holds generated reports and is
throwaway, while these are the record of how the code came to exist, and belong
next to it. A second round on the same feature gets a new dated directory
rather than reopening the finished one.

**Language policy**: the line is drawn at *who reads it*, not who wrote it.

**Follows the user's language** - everything inside a `.feature` file that a
person reads as prose: feature, rule and scenario names, descriptions, step
text, `Examples` headers. Also the conversation and the report chrome
(`--labels en|zh-CN|zh-TW|ja`).

**Stays English** - the Gherkin keywords themselves (`Feature:`, `Rule:`,
`Background:`, `Scenario:`, `Scenario Outline:`, `Examples:`, `Given`, `When`,
`Then`, `And`, `But`), tags (`@REQ-1042`, `@web`), step definition code and
config, DDL identifiers, OpenAPI paths and schema names, file and directory
names, and commit messages.

So a Chinese feature file looks like this, and needs no `# language:` header
because the keywords are the default English ones:

```gherkin
Feature: 购物车结账

  @REQ-1042 @web
  Scenario: 为单件商品下单
    Given 我的购物车中有 "ESP-100 浓缩咖啡杯"，单价 12.50 元
    When 我提交订单
    Then 订单总额为 42.50 元
```

The reason for the split: Gherkin exists so the people who own the requirement
can read their specification back. Written in a language its reviewers do not
read, it stops being a specification and becomes test code with extra ceremony.
Keywords, tags and identifiers go the other way - they are syntax and keys the
tooling matches on, not prose, so they stay stable whatever language the
sentences are in. Keeping them English also keeps editor highlighting, IDE
completion and every cucumber implementation on their best-supported path.

Localized keywords (`功能:` / `場景:` / `機能:`) are still parsed - `en`, `zh-CN`,
`zh-TW` and `ja` - so an existing localized suite keeps working. Follow it rather
than converting it, but do not start a new suite that way.

When a project's existing feature files are already in English, keep writing
English: a half-translated suite is worse than either language.

## Requirements

- Node.js 14+ for the bundled scripts (no packages needed).
- Per stack: `@cucumber/cucumber`, `io.cucumber`, `pytest-bdd`, or `Reqnroll`.
- Web lane: `playwright` / `Microsoft.Playwright` / `com.microsoft.playwright`,
  with the browsers installed in the environment that runs the suite.
- Mobile lane: an Appium 2 server with the `uiautomator2` and/or `xcuitest`
  driver, the platform toolchain (Android SDK + AVD, or Xcode + simulators), and
  the language's Appium client (`webdriverio`, `io.appium:java-client`,
  `Appium-Python-Client`, `Appium.WebDriver`). iOS requires macOS.

## Two lanes

| Lane | Target | Driver |
|---|---|---|
| **web** | Desktop browsers, and responsive web at a phone viewport | **Playwright** |
| **mobile** | Native Android/iOS apps, hybrid apps, WebViews, browsers on real devices and emulators | **Appium** |

Gherkin is driver-agnostic, so both lanes share the feature files: write the
behaviour once, tag the lane-specific scenarios `@web` / `@mobile`, and run each
lane as its own job with its own step definitions and results file. All three
reports work across both - the flow map draws pages for web and screens for
mobile, and coverage merges both lanes' results per requirement.

**The design-system check covers the web lane only.** Compose, SwiftUI and
React Native component systems are not recognized, so `plan-with-feature` does
not ask about styling on a `@mobile` feature. Say that rather than improvising
a mobile design system.

See `skills/bdd-setup/references/appium.md` (mobile lane: server, drivers,
capabilities, screen identity, per-language templates, CI) and
`skills/bdd-setup/references/responsive-web.md` (web lane viewport emulation,
and why it is not a device).

## License

MIT
