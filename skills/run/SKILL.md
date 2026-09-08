---
name: run
description: This skill should be used when a cucumber suite must be executed and measured - for example "run the BDD tests", "run the cucumber scenarios", "run the mobile app tests", "what is our requirement coverage", "which requirements are not covered by tests", "why is this scenario undefined", "generate the coverage report", "gate CI on BDD coverage", or when the user asks how much of the specified behaviour is actually verified. Covers both the Playwright web lane and the Appium mobile lane.
---

# Run the cucumber suite and measure requirement coverage

Execute the suite in whichever language stack the project uses, then turn the
results into a requirement coverage report that answers the only question
stakeholders ask: *which requirements are verified, and which are not?*

## Communication policy

- Commands, tags and any generated code in **English**.
- Explain results and next steps to the user in **their** language; pass
  `--labels` to localize the HTML report for its readers.

## 1. Run the suite

Detect the stack (see the `init` skill, step 1, if unsure) and the lane, then run:

| Stack | Command | Results file |
|---|---|---|
| TypeScript/JS | `npx cucumber-js` | `bdd-artifacts/cucumber.ndjson` (messages) |
| Java (Maven) | `mvn test` | `bdd-artifacts/cucumber.ndjson` (messages) |
| Java (Gradle) | `./gradlew test` | same |
| Python (pytest-bdd) | `pytest` | `bdd-artifacts/cucumber.json` |
| Python (behave) | `behave -f json -o bdd-artifacts/cucumber.json` | same |
| C#/.NET | `dotnet test` | `bdd-artifacts/cucumber.json` |

**Web lane** (Playwright) - the environment contract from the `init` skill:

```bash
BDD_BASE_URL=http://localhost:3000 \
BDD_BROWSER=chromium \
BDD_TRACE=retain-on-failure \
npx cucumber-js --tags 'not @wip and not @manual and not @mobile'
```

**Mobile lane** (Appium) - a separate run, a separate results file:

```bash
BDD_DRIVER=appium BDD_PLATFORM=android \
BDD_APP=./app/build/outputs/apk/debug/app-debug.apk \
BDD_DEVICE_NAME="Android Emulator" \
npx cucumber-js -p mobile --tags 'not @wip and not @manual and not @web'
```

The runner and the feature files are the same; the driver, the glue path and the
results file differ - see
`${CLAUDE_PLUGIN_ROOT}/skills/init/references/appium.md` section 9.

Before running (web lane):

- Confirm the app under test is reachable at `BDD_BASE_URL`. If it is not
  running, ask the user how to start it - do not start long-running servers on
  your own initiative, and never run a suite against a production URL.

Before running (mobile lane), check all four or the run fails minutes in:

1. Appium server answers: `curl -s "${BDD_APPIUM_URL:-http://127.0.0.1:4723}/status"`.
   If not, ask the user to start it (`appium`) rather than starting a long-running
   server yourself.
2. The driver is installed: `appium driver list --installed`.
3. A device is available: `adb devices` (Android) or
   `xcrun simctl list devices booted` (iOS).
4. The app binary at `BDD_APP` exists and is current. A stale binary produces
   failures that look like product bugs - check its build time and say what you found.

For both lanes:

- Choose a tag filter and say what it excludes. `@wip` and `@manual` are always
  excluded from execution; they still count in the specification.
- Never point the mobile lane at a shared or production account without asking:
  a scenario that sends a real notification or payment cannot be undone.

Add `--tags '@smoke'` for the fast loop, and run the full suite before reporting
coverage numbers - a filtered run makes everything else look "not executed".

## 2. Build the coverage report

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/coverage.cjs features/ \
  --results bdd-artifacts/cucumber.ndjson \
  --results bdd-artifacts/cucumber-mobile.ndjson \
  --requirements docs/requirements.md \
  --out bdd-artifacts/coverage.html \
  --json bdd-artifacts/coverage.json \
  --labels zh-CN
```

Pass every lane's results file. A requirement covered by a web scenario and a
mobile scenario shows both, and its status is worst-wins across them - which is
the honest answer to "is this requirement verified".

| Option | Effect |
|---|---|
| `[featurePaths...]` | Feature files/directories (same defaults as the spec report) |
| `--results <file>` | Repeatable. Cucumber messages ndjson, cucumber JSON, or JUnit XML |
| `--requirements <file>` | The requirement backlog: **without it, requirements that have no scenario at all cannot be detected** |
| `--out` / `--json` | HTML and structured model outputs |
| `--labels <tag>` | Report chrome language: `en` \| `zh-CN` \| `zh-TW` \| `ja` |
| `--req-prefix <p>` | Extra requirement tag prefix, repeatable |
| `--fail-under <pct>` | Exit 1 when requirement coverage is below the threshold |
| `--fail-on-failed` | Exit 1 when any executed case failed |

Run it with no `--results` to get the specification-side picture only (which
requirements have scenarios) - useful before any test exists.

## 3. Read the numbers correctly

`references/coverage-model.md` defines each metric precisely. The short version:

- **Requirement coverage** = requirements with at least one scenario ÷ all known
  requirements. Only meaningful when a `--requirements` backlog is supplied;
  otherwise the denominator is just the tags found in the specs, and the number
  is always 100%. Say which case applies when reporting.
- **Execution coverage** = scenarios with at least one execution ÷ all scenarios.
- **Pass rate** = passed case results ÷ executed case results.
- **Requirement status** is worst-wins across its scenarios:
  `uncovered` (no scenario) → `not-executed` → `partial` → `undefined`
  (unimplemented steps) → `failed` → `passed`.

A feature-level requirement tag is inherited by every scenario in the file, so
one failing scenario marks the whole requirement failed. That is intended - but
mention it when a requirement looks worse than the user expects.

## 4. Report honestly

Always report, in the user's language:

1. Executed / total scenarios, and the tag filter that was applied.
2. Passed, failed, undefined, pending, skipped counts.
3. Requirements with no scenario at all (the real coverage gap).
4. Requirements whose scenarios exist but never ran.
5. Scenarios with no requirement tag (untraceable behaviour).
6. Executed cases that matched no scenario (stale results file, or renamed scenario).
7. The path of the HTML report.

Never present a pass rate without the execution coverage next to it: 100% pass
over 10% of the suite is not good news. If the run was filtered, say so in the
same sentence as the pass rate.

## 5. Triage failures

Read `references/troubleshooting.md`. Order of diagnosis:

1. **Undefined steps** - the step text has no definition. Either fix the text to
   match an existing definition or implement it (the `init` skill has the patterns).
   Undefined is never a test failure to be ignored: the behaviour is unverified.
2. **Failed steps** - re-run only that scenario with `BDD_HEADED=1 BDD_SLOWMO=250`
   and `BDD_TRACE=on`, then open the trace
   (`npx playwright show-trace bdd-artifacts/traces/<scenario>.zip`).
3. **Flaky** - re-run three times before touching the code. If it fails
   intermittently, fix the wait (never `waitForTimeout`); quarantine with
   `@flaky` plus an issue link only as a last resort, and tell the user it is
   excluded from the gate.
4. **Whole suite fails at start** - app not reachable, browsers not installed,
   or step-definition glue path wrong. Check those three before reading test code.
5. **Mobile-specific**: `ECONNREFUSED :4723` means no Appium server;
   `Could not find a connected Android device` means no emulator;
   an `Ambiguous step definition` right after the mobile lane was added means
   both lanes' glue is loaded in one run - split the glue paths.
6. **Mobile flakiness has extra causes**: session startup timeouts (raise
   `newCommandTimeout`), permission dialogs (use `autoGrantPermissions` /
   `autoAcceptAlerts`), and `noReset: true` leaking state between scenarios.

Fix the product code when the scenario is right; fix the scenario when the
requirement changed. Ask the user which it is when the answer is not obvious
from the requirement - do not silently rewrite a scenario to match the code.

## 6. Optional: page flow map from the same run

If the run was captured with `BDD_FLOW_CAPTURE=1`, generate the transition
diagram from the same artifacts - see `flow-map`. The web lane produces a
page flow; the mobile lane produces a screen flow from the same generator.

## 7. Gate CI

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/coverage.cjs features/ \
  --results bdd-artifacts/cucumber.ndjson \
  --requirements docs/requirements.md \
  --fail-under 90 --fail-on-failed
```

Exit codes: `0` pass, `1` gate failed, `2` no feature files found. Suggest a
gate only when the user asks for one, and start the threshold at the current
measured coverage, not at an aspirational number.

## Reference files

- `references/coverage-model.md` - exact definition of every metric, matching rules, and their limits
- `references/troubleshooting.md` - symptom-to-cause table for runs, matching failures and flakiness
