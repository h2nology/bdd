# bdd - Behaviour-Driven Development plugin for Claude Code

Take a one-line requirement to working, traceable code: mine it into Gherkin,
review it as an HTML document, scaffold cucumber + Playwright in the project's
language, give the UI work a design system to build against, drive each scenario
to green with outside-in TDD, run the suite with requirement coverage, derive a
page flow map from the run's screenshots, and generate database DDL from the
same specs.

## Skills

| Skill | Use it for |
|---|---|
| `discover` | Mine a requirement, story, or bug into rules, examples and questions, then write `.feature` files |
| `bdd-setup` | Set up (or repair) a cucumber harness in TypeScript/JavaScript, Java, Python or C#/.NET - Playwright for web, Appium for mobile |
| `design-system-setup` | Establish what the UI should look like - a `DESIGN.md`, any component library, an advisor-generated spec, or several of those together - and compile its tokens into code the pages can reference (web lane) |
| `planning` | Keep the plan, the evidence and the decisions on disk - `task_plan.md`, `progress.md`, `findings.md` per plan, for feature work and for work with no feature file |
| `run` | Execute the suite and report requirement coverage, execution coverage and pass rate; gate CI |
| `flow-map` | Turn per-step screenshots into a page (web) or screen (mobile) transition diagram, transition table and screenshot gallery |
| `export-ddl` | Derive a data model from the scenarios and emit DDL for PostgreSQL, MySQL, Oracle, SQL Server or SQLite |
| `export-openapi` | Derive an HTTP contract from the scenarios, or report which documented operations no scenario covers |
| `html-report` | Render a report as one self-contained HTML file; its `spec` mode backs the specification report |

Each is invocable as `/bdd:<name>` and triggers automatically from a matching
request. Use the namespaced form: the plugin's `run` shares its bare name with
Claude Code's built-in `/run`, so `/bdd:run` is what reaches this plugin.

## Commands

| Command | Use it for |
|---|---|
| `/bdd:bootstrap` | Set a project up end to end: the cucumber harness, then the design system the UI work builds against - `bdd-setup` and `design-system-setup` in order |
| `/bdd:spec-report` | Turn the feature files into an HTML specification report with a requirement traceability matrix, for stakeholder review and sign-off |
| `/bdd:sketch` | Derive the UI the feature files imply - every data state of each page, with a callout beside it saying what each button and link does and which scenario says so - and render it as a read-only wireframe board, before any code exists |
| `/bdd:status` | Show what the planning files say is in progress: which feature is being driven, which capability is in hand, what happens next, and which plans need attention |
| `/bdd:plan-with-feature` | Plan one feature file's implementation: the dated planning directory, this project's six test commands, and a scenario queue filled from a real baseline run |
| `/bdd:plan` | Plan work that has no feature file - infrastructure, an upgrade, a cleanup - as phases with a verification for each |
| `/bdd:implement` | Drive an existing plan forward. Pauses after every phase by default; `--auto` runs straight through |

A command runs only when you type it. `spec-report` parses, confirms the
reviewer's language and theme, and renders through `html-report`; `status` reads
the plans and reports them; `bootstrap` runs the two setup skills in order. None
of the three decides anything, so none needs to be a skill.

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

**Setting up is two skills for the same reason.** A harness is installed once
and then left alone - re-running `bdd-setup` is a **repair**. A design system
evolves with the product - re-running `design-system-setup` is an **update**.
One skill holding both meanings would do the wrong thing half the time, and a
project can want either half without the other. `/bdd:bootstrap` runs both when
you are starting from nothing; call the skills by name when you are not.

**What the design system is not.** It says what the pages should look like;
nothing checks that they do. The scenarios assert behaviour, so they go green on
an unstyled page just as happily as on a finished one. Treat it as the spec the
implementation loop builds against, not as a gate that catches you ignoring it.

## Typical flow

```
requirement
  -> /bdd:discover      features/*.feature
  -> /bdd:spec-report   bdd-artifacts/spec-report.html   (stakeholder sign-off)
  -> /bdd:bootstrap     harness + design system          (once per project)
  -> /bdd:sketch        bdd-artifacts/sketch.html        (what it would look like)
  -> /bdd:plan-with-feature  docs/planning/<date>-<feature>/  (the plan, and a real baseline)
  -> /bdd:implement     the code                          (capability by capability, to green)
  -> /bdd:run           bdd-artifacts/coverage.html      (what is verified)
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
| `scripts/coverage.cjs` | Feature files + test results -> requirement coverage report, with CI gating |
| `scripts/flow-map.cjs` | Step captures -> Mermaid page flow diagram, transition table, gallery |
| `scripts/openapi.cjs` | Gherkin -> stated HTTP operations + inferred schemas; and OpenAPI operation coverage |
| `scripts/planning-status.cjs` | Planning files -> what is in progress, and which plans have drifted, stalled or blocked |
| `scripts/phase-status.cjs` | Set one phase's status in a plan - validated, locked, atomic |
| `scripts/lib/gherkin.cjs` | Gherkin parser (dialects: `en`, `zh-CN`, `zh-TW`, `ja`) |
| `scripts/lib/results.cjs` | Reads cucumber messages ndjson, legacy cucumber JSON, or JUnit XML |
| `scripts/lib/labels.cjs` | Localized report chrome |
| `scripts/lib/util.cjs` | Shared helpers and report CSS |

Run any of them directly:

```bash
node scripts/spec-report.cjs features/ --out out.html --labels zh-CN
node scripts/coverage.cjs features/ --results bdd-artifacts/cucumber.ndjson --requirements docs/requirements.md
node scripts/flow-map.cjs --input bdd-artifacts/flow --out out.html
node scripts/openapi.cjs extract features/ --json extract.json
node scripts/openapi.cjs coverage features/ --spec openapi.yaml --out cov.html
node scripts/planning-status.cjs --root docs/planning
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

**Design system**, for the web lane: every source stays in its own format and is
never copied into another. A `DESIGN.md` (project root, that exact name), any
component library's own files, and a design advisor's output **coexist** - a
`DESIGN.md` defining tokens beside a library supplying components is a normal
pairing, and an advisor is a tool that produces one of those rather than a third
kind of thing. Precedence only arises where two of them define the same value,
and then the hand-written one wins and the override is reported.
`design-system-setup` compiles tokens out of a source only when they are not
already loadable code; generated files carry a header saying so - edit the source
and re-run instead. Detection rules live once, in
`skills/design-system-setup/references/design-sources.md`, and `plan-with-feature`
reads the same ones so the two cannot disagree.

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

**`design-system-setup` covers the web lane only.** Compose, SwiftUI and React
Native component systems are not supported yet, so a mobile-only project gets a
harness and no design system - `/bdd:bootstrap` says so rather than skipping the
step quietly.

See `skills/bdd-setup/references/appium.md` (mobile lane: server, drivers,
capabilities, screen identity, per-language templates, CI) and
`skills/bdd-setup/references/responsive-web.md` (web lane viewport emulation,
and why it is not a device).

## License

MIT
