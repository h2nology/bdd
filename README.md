# bdd - Behaviour-Driven Development plugin for Claude Code

Take a one-line requirement to executable, traceable specifications: mine it into
Gherkin, review it as an HTML document, scaffold cucumber + Playwright in the
project's language, run the suite with requirement coverage, derive a page flow
map from the run's screenshots, and generate database DDL from the same specs.

## Skills

| Skill | Use it for |
|---|---|
| `discover` | Mine a requirement, story, or bug into rules, examples and questions, then write `.feature` files |
| `spec-report` | Turn the feature files into an HTML specification report with a requirement traceability matrix, for stakeholder review |
| `init` | Set up (or repair) a cucumber harness in TypeScript/JavaScript, Java, Python or C#/.NET - Playwright for web, Appium for mobile |
| `run` | Execute the suite and report requirement coverage, execution coverage and pass rate; gate CI |
| `flow-map` | Turn per-step screenshots into a page (web) or screen (mobile) transition diagram, transition table and screenshot gallery |
| `ddl` | Derive a data model from the scenarios and emit DDL for PostgreSQL, MySQL, Oracle, SQL Server or SQLite |
| `openapi` | Derive an HTTP contract from the scenarios, or report which documented operations no scenario covers |

Each is invocable as `/bdd:<name>` and triggers automatically from a matching
request. Use the namespaced form: the plugin's `init` and `run` share their bare
names with Claude Code's built-in `/init` and `/run`, so `/bdd:init` and
`/bdd:run` are what reach this plugin.

## Typical flow

```
requirement
  -> /bdd:discover      features/*.feature
  -> /bdd:spec-report   bdd-artifacts/spec-report.html   (stakeholder sign-off)
  -> /bdd:init          harness + step definitions        (once per project)
  -> /bdd:run           bdd-artifacts/coverage.html      (what is verified)
  -> /bdd:flow-map      bdd-artifacts/flow-map.html      (which screens were exercised)
  -> /bdd:ddl           migrations/                       (schema implied by the specs)
  -> /bdd:openapi       openapi.yaml                      (HTTP contract implied by the specs)
```

## Bundled scripts

Zero-dependency Node.js (`.cjs`, no `npm install`, no `node_modules`) so they run
inside Java, Python and .NET projects too. Node 14+.

| Script | Purpose |
|---|---|
| `scripts/spec-report.cjs` | Gherkin -> HTML specification report + JSON model |
| `scripts/coverage.cjs` | Feature files + test results -> requirement coverage report, with CI gating |
| `scripts/flow-map.cjs` | Step captures -> Mermaid page flow diagram, transition table, gallery |
| `scripts/openapi.cjs` | Gherkin -> stated HTTP operations + inferred schemas; and OpenAPI operation coverage |
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
`skills/init/references/appium.md`.

**Artifacts** all land in `bdd-artifacts/` (git-ignore it).

**Language policy**: everything the tooling produces - feature files, step text,
config, commit messages - is English. Conversation with the user, and the report
chrome (`--labels en|zh-CN|zh-TW|ja`), follow the user's language.

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

See `skills/init/references/appium.md` (mobile lane: server, drivers,
capabilities, screen identity, per-language templates, CI) and
`skills/init/references/responsive-web.md` (web lane viewport emulation, and
why it is not a device).

## License

MIT
