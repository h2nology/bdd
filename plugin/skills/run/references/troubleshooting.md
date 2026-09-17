# Run and coverage troubleshooting

## The suite does not start

| Symptom | Cause | Fix |
|---|---|---|
| `Executable doesn't exist at .../chrome-linux/chrome` | Browsers not installed | `npx playwright install chromium` (or the stack's equivalent) |
| `net::ERR_CONNECTION_REFUSED` on every scenario | App not running, or wrong `BDD_BASE_URL` | Start the app, or correct the URL. Ask the user how the app starts |
| `0 scenarios (0 passed)` | Wrong `paths` / features base dir, or every scenario filtered out | Check the runner config paths and the tag expression |
| `Undefined. Implement with the following snippet` for everything | Glue/step path not loaded | Fix `import`/`cucumber.glue`/`bdd_features_base_dir`/`[Binding]` assembly |
| Timeout on the first step of every scenario | Browser launched but page never created | The `Before` hook is not creating a context/page (see the `bdd-setup` skill) |

## Scenarios interfere with each other

Symptom: a scenario passes alone and fails in the suite, or passes only when
another ran first.

- Each scenario must get a **fresh browser context** (own cookies and storage).
  A shared context leaks login state.
- Test data must be created by the scenario or by a per-scenario fixture, never
  by a previous scenario.
- Ordering dependence is a defect in the scenario, not a reason to fix the order.
  Run with `--order random` (or the stack's equivalent) once the suite is green
  to prove independence.

## Coverage says 0 executed

Diagnose in this order:

1. Does the results file exist and is it non-empty? The report prints the format
   it detected per file; `missing` or `unrecognized` means the runner never wrote it.
2. Does the report list "executed cases not found in specs"? Then names do not
   match - a renamed scenario, a stale results file, or feature files being read
   from a different directory than the runner used.
3. Is the results file from a filtered run? Then most scenarios legitimately did
   not execute; re-run unfiltered before quoting coverage.

## Flaky scenarios

Fix causes, in this order of likelihood:

1. **Waiting on time instead of state** - replace `waitForTimeout` with an
   assertion on the state the step is about (`expect(locator).toBeVisible()`).
2. **Race with an in-flight request** - wait for the response or for the UI state
   it produces, not for a fixed delay.
3. **Shared mutable test data** - two scenarios editing the same record. Give
   each scenario its own data, keyed by a unique value.
4. **Animation** - assert on the end state; disable animations in the test
   environment if the app allows it.
5. **Clock and timezone** - pin the timezone in the browser context
   (`timezoneId`) and freeze time in the app where the requirement is time-dependent.

Only after those: mark `@flaky` with an owner and an issue link, exclude it from
the gate, and tell the user that the behaviour is now unverified.

## Reported numbers look wrong to the user

| Complaint | Likely explanation |
|---|---|
| "We have 50 requirements, why is nothing said about them?" | Nothing in this plugin measures requirements. The runner counts scenarios; `@REQ-*` tags have to be read against the results by hand, and a requirement with no scenario at all cannot be detected at all |
| "One scenario shows 5 cases" | It is a `Scenario Outline`; outline rows are counted individually |
| "The pass rate dropped but nothing changed" | Retries: a scenario that fails then passes reports both executions - take the worst |
| "A scenario I deleted still appears" | Stale results file; delete `bdd-artifacts/` and re-run |
| "Manual tests drag the number down" | `@manual` scenarios are excluded from execution but still count in the specification; report them as a separate line |
