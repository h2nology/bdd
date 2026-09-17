---
name: run
description: This skill should be used when a cucumber suite must be executed and its results read honestly - for example "run the BDD tests", "run the cucumber scenarios", "run the mobile app tests", "how many scenarios actually pass", "why is this scenario undefined", "which scenarios never ran", or when the user asks how much of the specified behaviour is actually verified. Covers both the Playwright web lane and the Appium mobile lane.
argument-hint: "[feature paths or tags] [web|mobile]"
---

# Run the cucumber suite and read what it reports

Execute the suite in whichever language stack the project uses, then report what
the run actually establishes - and, just as important, what it does not.

**What this skill does not do: requirement-level coverage.** There is no
requirement coverage report in this plugin. The runner counts scenarios, not
requirements, so "which requirements are verified" can only be answered by
reading `@REQ-*` tags against the run's per-scenario results by hand. Say that
plainly rather than presenting a scenario pass rate as if it answered the
requirement question.

## Communication policy

- Commands, tags and any generated code in **English**.
- Explain results and next steps to the user in **their** language.

## 1. Run the suite

Detect the stack (see the `bdd-setup` skill, step 1, if unsure) and the lane,
then run:

| Stack | Command | Results file |
|---|---|---|
| TypeScript/JS | `npx cucumber-js` | `bdd-artifacts/cucumber.ndjson` (messages) |
| Java (Maven) | `mvn test` | `bdd-artifacts/cucumber.ndjson` (messages) |
| Java (Gradle) | `./gradlew test` | same |
| Python (pytest-bdd) | `pytest` | `bdd-artifacts/cucumber.json` |
| Python (behave) | `behave -f json -o bdd-artifacts/cucumber.json` | same |
| C#/.NET | `dotnet test` | `bdd-artifacts/cucumber.json` |

**Web lane** (Playwright) - the environment contract from the `bdd-setup` skill:

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
`${CLAUDE_PLUGIN_ROOT}/skills/bdd-setup/references/appium.md` section 9.

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
any numbers - a filtered run makes everything else look like it does not exist.

The results file is overwritten by every run, so **the last run wins**: one
filtered run after a full one leaves a partial file behind, and anything read
from it understates the suite. Nothing checks this for you, so check it
yourself: if the scenario total is lower than the number of scenarios in
`features/`, the run was filtered - re-run unfiltered rather than reporting the
numbers underneath it.

## 2. Read the run's own output

The runner is the only thing that reports here. For cucumber-js the summary
formatter prints the two lines that matter:

```
21 scenarios (9 passed, 12 undefined)
146 steps (106 passed, 16 skipped, 24 undefined)
```

Where the stack emits one, the runner's own HTML report
(`bdd-artifacts/cucumber.html` for cucumber-js, via the `html:` formatter) gives
the per-scenario breakdown, with the failure message and any attached screenshot.
That file is the runner's, not this plugin's - its layout is not configurable
from here.

For anything the runner does not print - which scenarios are in which state,
grouped by feature - read the results file. **Do not hand-roll the parser**:
`${CLAUDE_PLUGIN_ROOT}/scripts/lib/results.cjs` already reads all four formats
the supported stacks emit (cucumber messages ndjson, legacy cucumber JSON, JUnit
XML) and normalizes them, including taking the worst status per scenario when a
retry produced several executions.

```bash
node -e '
const { loadResults } = require(process.env.CLAUDE_PLUGIN_ROOT + "/scripts/lib/results.cjs");
const { cases } = loadResults(["bdd-artifacts/cucumber.ndjson"]);
const byFile = {};
for (const c of cases) (byFile[c.uri] ||= []).push(c);
for (const [uri, rows] of Object.entries(byFile).sort()) {
  const pass = rows.filter(r => r.status === "passed").length;
  console.log(`\n${uri}  ${pass}/${rows.length} passed`);
  for (const r of rows) console.log(`  ${r.status.padEnd(10)} ${r.scenarioName}`);
}'
```

Each case carries `uri`, `scenarioName`, `tags`, `line`, `status`, `durationMs`
and `steps` - `tags` is what lets you answer a question about `@REQ-*` ids by
hand, since nothing computes that for you.

## 3. Read the numbers correctly

- **Pass rate** = passed scenarios ÷ executed scenarios.
- **Execution coverage** = executed scenarios ÷ all scenarios in `features/`.
  The runner does not compute this: it only knows what it ran. Count the
  `Scenario:` / `Example:` blocks in the specs yourself when a filter was used.
- **`undefined` is not a pass and not a skip.** It means no step definition
  claims those sentences - the scenario is written and nothing implements it.
  Count it as unverified behaviour, every time.
- **`@wip`, `@manual`, `@flaky` and quarantined scenarios are not covered.**
  They still count in the specification's denominator.
- **A `Scenario Outline` is one case per `Examples` row**, so its scenario count
  is larger than the number of blocks in the file.

## 4. Report honestly

Always report, in the user's language:

1. Executed / total scenarios, and the tag filter that was applied.
2. Passed, failed, undefined, pending, skipped counts.
3. Which scenarios are `undefined` - by name, and which feature they are in.
   This is the real gap, and a bare count hides it.
4. Scenarios excluded by the tag filter, by name or by tag.
5. Scenarios with no requirement tag, if the project uses them - that behaviour
   is untraceable back to why it exists.
6. The path of the runner's report, where the stack produces one.

**Do not report a requirement coverage percentage.** Nothing here computes one.
If the user asks which requirements are verified, read the `@REQ-*` tags off the
scenarios and answer per requirement from the per-scenario results - and say
that a requirement with no scenario at all cannot be detected this way, because
nothing in the repository lists the requirements that have no scenario yet.

Say what the suite was pointed at. The web lane tests whatever `BDD_BASE_URL`
serves, which in practice is a development server - so behaviour that only
appears in a production build (caching, prerendering, minification, a different
data path) is **not** covered by a green run, however green it is. If that
distinction could matter, say the run was against a dev server rather than
letting "all scenarios pass" stand for the built application.

Never present a pass rate without the execution coverage next to it: 100% pass
over 10% of the suite is not good news. If the run was filtered, say so in the
same sentence as the pass rate.

## 5. Triage failures

Read `references/troubleshooting.md`. Order of diagnosis:

1. **Undefined steps** - the step text has no definition. Either fix the text to
   match an existing definition or implement it (the `bdd-setup` skill has the
   patterns).
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

The runner's own exit code is the gate: cucumber-js exits non-zero when any
scenario failed **or** any step was undefined, which is the behaviour you want -
an unimplemented step is not a pass.

```bash
npx cucumber-js --tags 'not @wip and not @manual'
```

There is no coverage threshold to gate on. If the user wants one - "fail the
build when fewer than N% of scenarios pass" - say that it would have to be built
from the results file, and that a threshold on a filtered run measures nothing.
Suggest a gate only when the user asks for one.

## Reference files

- `references/troubleshooting.md` - symptom-to-cause table for runs, matching failures and flakiness
