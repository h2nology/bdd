---
name: bdd-setup
description: This skill should be used when a project needs a cucumber BDD test harness set up or repaired - for example "set up cucumber in this project", "initialize BDD testing", "add Playwright to our cucumber suite", "set up Appium for our mobile app", "scaffold step definitions", "configure the test environment for feature files", "test our Android/iOS app with cucumber", or when feature files exist but nothing can execute them. Web runs on Playwright, mobile runs on Appium; covers TypeScript/JavaScript, Java, Python and C#/.NET stacks.
user-invocable: false
---

# Set up a cucumber harness

Install and wire the runner, the driver, the directory layout, the World /
context object, and the hooks that the rest of this plugin depends on.

## Two lanes, one set of feature files

| Lane | Target | Driver |
|---|---|---|
| **web** | Desktop browsers, and responsive web at a phone viewport | **Playwright** |
| **mobile** | Native Android/iOS apps, hybrid apps, WebViews, browsers on real devices and emulators | **Appium** |

Gherkin is driver-agnostic, so both lanes share the feature files. What differs
is the step definition layer, the hooks, and the tags that select the lane.
Never drive a native app with Playwright, and never drive a desktop browser
through Appium.

## Communication policy

- All generated code, config, file names and comments in **English**.
- **Step text follows the feature files**, which follow the team's language even
  though their keywords stay English. When the step text is not English, the step
  definitions must match it character for character - see the "non-English step
  text" section of the language reference before writing the glue.
- Explain choices and report results to the user in **their** language.

## Procedure

### 1. Inspect before writing anything

Never scaffold blind - an existing harness must be extended, not overwritten.

```bash
ls -a
cat package.json 2>/dev/null | head -40
ls pom.xml build.gradle build.gradle.kts requirements.txt pyproject.toml *.csproj *.sln 2>/dev/null
find . -name '*.feature' -not -path '*/node_modules/*' | head
ls features src/test/resources/features Features tests/features 2>/dev/null
```

Determine and report:

- **Language and build tool** (package manager, Maven vs Gradle, pip vs poetry vs uv, NUnit vs xUnit vs MSTest).
- **Whether a cucumber runner already exists** - if yes, only add what is missing
  (usually the Playwright driver and the flow-capture hooks) and say so.
- **Whether feature files already exist** and where. Keep their location.
- **The application under test**: how it starts, and on which URL. If unknown, ask.
- **Which lane(s) the project needs**: a web app (Playwright), a mobile app
  (Appium), or both. Look for `android/`, `ios/`, `*.xcodeproj`, `pubspec.yaml`,
  `build.gradle` with an Android plugin, or an existing `appium` dependency. If
  both exist, ask which to set up first rather than scaffolding both at once.

### 2. Confirm the plan with the user

State, in the user's language: the language stack detected, the lane (web,
mobile, or both), the packages to be added, the files to be created, and the app
URL or app binary the suite will target. Ask before touching dependency
manifests. If several test frameworks are plausible (NUnit/xUnit,
pytest-bdd/behave), ask which the team uses.

For the mobile lane, also confirm: target platform (Android, iOS, or both),
where the app binary comes from, and whether tests run on an emulator/simulator
or a real device. iOS real devices need macOS plus signing - surface that before
starting, not after.

### 3. Read the language reference and write the files

Web lane - the cucumber runner and the Playwright driver:

| Stack | Reference | Runner + driver |
|---|---|---|
| TypeScript / JavaScript | `references/typescript.md` | `@cucumber/cucumber` + `playwright` |
| Java | `references/java.md` | `io.cucumber:cucumber-java` + `com.microsoft.playwright` |
| Python | `references/python.md` | `pytest-bdd` + `playwright` |
| C# / .NET | `references/dotnet.md` | `Reqnroll` + `Microsoft.Playwright` |

Mobile lane - the same cucumber runner from the table above, with Appium as the
driver: `references/appium.md` covers all four languages (server and driver
setup, capabilities, screen identity, hooks, capture, running both lanes from
one suite).

Responsive web at a phone viewport stays in the web lane:
`references/responsive-web.md`. It is emulation, not a device - say so whenever
the user asks about mobile.

Verify the versions before writing config: package APIs drift. Check what the
project (or the registry) actually installs, and if a documentation lookup tool
is available in the session, confirm the current config format rather than
trusting the reference verbatim. Report any deviation you had to make.

### 4. Standard contract every stack must satisfy

The reports in this plugin only work if the harness honours these. They are
identical across languages by design.

**Environment variables**

| Variable | Default | Meaning |
|---|---|---|
| `BDD_BASE_URL` | `http://localhost:3000` | Root URL of the app under test |
| `BDD_BROWSER` | `chromium` | `chromium` \| `firefox` \| `webkit` |
| `BDD_HEADED` | unset (headless) | `1` to show the browser |
| `BDD_SLOWMO` | `0` | Milliseconds of delay per action, for debugging |
| `BDD_DRIVER` | `playwright` | `playwright` (web lane) \| `appium` (mobile lane) |
| `BDD_DEVICE` | unset (desktop) | **Web lane**: Playwright viewport profile, e.g. `iPhone 15` |
| `BDD_TIMEOUT` | `30000` | Step timeout in milliseconds |
| `BDD_FLOW_CAPTURE` | unset (off) | `1` to capture a screenshot + record per step |
| `BDD_FLOW_DIR` | `bdd-artifacts/flow` | Where capture records and screenshots go |
| `BDD_TRACE` | `off` | `on` \| `retain-on-failure` for Playwright traces (web lane) |

The mobile lane adds `BDD_PLATFORM`, `BDD_APPIUM_URL`, `BDD_DEVICE_NAME`,
`BDD_APP`, `BDD_APP_PACKAGE`, `BDD_APP_ACTIVITY`, `BDD_BUNDLE_ID`,
`BDD_PLATFORM_VERSION`, `BDD_UDID`, `BDD_AUTOMATION_NAME`, `BDD_NO_RESET` -
defined in `references/appium.md`. Note that `BDD_DEVICE` (Playwright viewport)
and `BDD_DEVICE_NAME` (Appium capability) are different variables; do not mix them.

**Artifact layout** (all generated, all git-ignored)

```
bdd-artifacts/
  cucumber.ndjson        # cucumber messages - the machine-readable run record (web lane)
  cucumber-mobile.ndjson # the mobile lane's results, kept separate
  cucumber.html          # the runner's own report, where the stack provides one
  flow/
    flow.ndjson          # one record per captured step
    <scenario-slug>/000-<step-slug>.png
  traces/                # Playwright traces
  spec-report.html       # written by spec-report
  flow-map.html          # written by flow-map
```

**Required hooks in every stack**

1. `Before` scenario - **web**: launch/reuse the browser, create a fresh context
   (isolated storage per scenario), create a page, start tracing when
   `BDD_TRACE` is set. **mobile**: open one Appium session per scenario, so no
   scenario inherits another's app state.
2. `AfterStep` - when `BDD_FLOW_CAPTURE=1`, screenshot and append one JSON line
   to `flow.ndjson` in the schema defined by
   `${CLAUDE_PLUGIN_ROOT}/skills/flow-map/references/capture-contract.md`.
   The web lane records `url` + `title`; the mobile lane records `screen` (the
   Android activity or an app-provided screen identifier) plus `platform` and
   `driver`. Failures must never abort the run: wrap the capture in try/catch.
3. `After` scenario - on failure attach a screenshot to the report; **web**: stop
   tracing and close the context, closing the browser in the run-level teardown;
   **mobile**: end the Appium session.

**Emit cucumber messages.** The `message` formatter (ndjson) is the richest
record of a run, and the only one that carries per-scenario results a script can
join back to the feature files - `flow-map` reads it, and so does anything that
has to answer "which scenarios are undefined". Where a stack cannot emit it,
legacy cucumber JSON or JUnit XML also work, with less precision - note the
limitation to the user.

### 5. Prove it works before reporting success

Scaffolding that has never run is not done. Always:

1. Install dependencies with the project's package manager.
2. Web lane: install browsers (`npx playwright install chromium`, `mvn ... install`,
   `playwright install`, `pwsh bin/.../playwright.ps1 install` - see the reference).
   Mobile lane: confirm the Appium server answers (`curl -s $BDD_APPIUM_URL/status`),
   the driver is installed (`appium driver list --installed`), and a device is
   attached (`adb devices`, or `xcrun simctl list devices booted`).
3. Write one throwaway smoke feature (or use an existing scenario). Web: open
   `BDD_BASE_URL` and assert the page title is non-empty. Mobile: launch the app
   and assert one known element on the first screen is displayed.
4. Run the suite. If the app under test is not running (web) or the binary is
   missing (mobile), say so and either start/build it as the user directs or run
   with a static fixture.
5. Confirm the results file is machine-readable end to end: it exists, it is
   valid ndjson (or JSON/XML for the stack), and it contains one record per
   scenario the run executed.
6. Delete the throwaway smoke feature. It existed to prove the harness can
   execute a scenario, and the report in the next paragraph is what survives
   it - do not ask whether to keep it. Nothing to delete if step 3 used an
   existing scenario.

Report exactly what ran, what passed, and anything you could not verify. Do not
report "set up successfully" when the suite has never executed a scenario.

### 6. Wire it into the project

- Add scripts/targets: `test:bdd` (web), `test:bdd:headed`, `test:bdd:responsive`
  (web at a phone viewport), `test:bdd:mobile` (Appium lane), `bdd:report`.
- Add `bdd-artifacts/` to `.gitignore` (never commit screenshots or traces).
- Mention CI: the web lane needs browsers in the image and the app reachable at
  `BDD_BASE_URL`; the mobile lane needs an Appium server plus an emulator (Linux
  runner with KVM for Android, macOS runner for iOS). Offer to add a CI job only
  if the user asks.

## Repairing an existing harness

Diagnose in this order, and fix only what is broken:

| Symptom | Cause | Fix |
|---|---|---|
| `Undefined. Implement with the following snippet` | Step text has no definition | Add the step definition, or fix the step text to match an existing one |
| Steps found but `page` is undefined | World/context not wired to the hooks | Fix `Before`/World construction |
| Scenarios leak state into each other | Context reused across scenarios | Create a fresh browser context per scenario |
| Results file has no executions in it | The run never started, or the formatter is not configured | Emit `message:` ndjson and check the run actually reached a scenario |
| Flow map empty | `BDD_FLOW_CAPTURE` not set, or hooks missing | See `flow-map` |
| `Ambiguous step definition` after adding the mobile lane | Web and mobile definitions for one phrasing loaded together | Split the glue paths and select one per runner profile (`appium.md` section 9) |
| `ECONNREFUSED 127.0.0.1:4723` | Appium server not running | Start `appium`; check `BDD_APPIUM_URL` |
| `An unknown server-side error ... UiAutomator2` | Driver or device missing | `appium driver install uiautomator2`; `adb devices` |
| Every mobile screen has the same name in the flow map | Single-activity app with no screen identifier | Have the app expose an accessibility id per screen (`appium.md` section 4) |

## Reference files

- `references/typescript.md` - cucumber-js + Playwright, full config, World, hooks, TS/ESM transpiling
- `references/java.md` - cucumber-jvm + Playwright Java, Maven and Gradle, JUnit Platform Suite runner
- `references/python.md` - pytest-bdd + playwright, conftest fixtures and hooks
- `references/dotnet.md` - Reqnroll + Microsoft.Playwright, bindings and hooks
- `references/appium.md` - the mobile lane: Appium server and drivers, capabilities, screen identity, per-language driver/hooks/capture, running both lanes from one suite, CI
- `references/responsive-web.md` - web-lane viewport emulation per language, and why it is not a device
- `${CLAUDE_PLUGIN_ROOT}/references/test-layout.md` - where **unit** tests go per stack, and why never beside the file under test. The cucumber suite's own location is set by this skill; that file governs the inner loop's tests
