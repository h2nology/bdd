# Flow capture contract

`flow-map.cjs` consumes exactly this format. The `bootstrap` skill's templates
write it in both lanes:

| Lane | Driver | Identity field |
|---|---|---|
| web | Playwright | `url` (+ `title`) |
| mobile | Appium | `screen` (+ `platform`, `driver`) |

Any other driver must write the same record shape.

## File layout

```
${BDD_FLOW_DIR}/                    # default: bdd-artifacts/flow
  flow.ndjson                       # one JSON object per line, appended per step
  <scenario-slug>/
    000-<step-slug>.png
    001-<step-slug>.png
```

- `flow.ndjson` is **append-only**, one complete JSON object per line, no
  trailing comma, no wrapping array. Each line must be written in a single
  append call so parallel workers cannot interleave partial lines.
- Any `.ndjson`, `.jsonl` or `.json` file under `--input` is read, recursively.
  A `.json` file may hold an array of records.
- Screenshot paths are recorded as written (relative to the working directory is
  recommended). The generator converts them to paths relative to the HTML output
  so the gallery works when the report is moved next to the artifacts.

## Record schema

```json
{
  "scenario": "Pay with a valid credit card",
  "scenarioUri": "features/checkout.feature",
  "scenarioLine": 12,
  "tags": ["@REQ-1042", "@smoke"],
  "stepIndex": 2,
  "keyword": "When",
  "step": "I submit payment with a valid card",
  "status": "passed",
  "url": "https://shop.example.test/checkout/payment",
  "title": "Payment",
  "screenshot": "bdd-artifacts/flow/pay-with-a-valid-credit-card/002-i-submit-payment.png",
  "timestamp": "2026-09-08T10:00:02.000Z",
  "platform": "web",
  "driver": "playwright",
  "device": "desktop"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `scenario` | string | yes | Scenario name as written in the feature file |
| `scenarioUri` | string \| null | no | Feature file path; separates scenarios with identical names |
| `scenarioLine` | number \| null | no | Scenario line; part of the grouping key |
| `tags` | string[] | no | Tags including `@`; requirement tags are shown as chips in the report |
| `stepIndex` | number | recommended | 0-based order within the scenario; the primary sort key |
| `keyword` | string | no | `Given`/`When`/`Then`, or the pickle step type where the keyword is unavailable |
| `step` | string | recommended | Step text; becomes the transition label |
| `status` | string | recommended | `passed` \| `failed` \| `undefined` \| `pending` \| `skipped`; `failed` draws the edge dashed |
| `url` | string | **yes for web** | The page URL at capture time; page identity is derived from it |
| `title` | string | no | Document title; becomes the page label |
| `screenshot` | string | no | Path to the PNG for this step |
| `timestamp` | ISO-8601 string | no | Fallback sort key when `stepIndex` is absent |
| `screen` | string | **yes for mobile** | Native screen identity: Android activity (`com.example.shop/.CartActivity`) or an app-provided screen id. Used when `url` is absent |
| `platform` | string | no | `web` \| `android` \| `ios`; shown as a chip |
| `driver` | string | no | `playwright` \| `appium` |
| `device` | string | no | Web: the `BDD_DEVICE` viewport profile or `desktop`. Mobile: the `BDD_DEVICE_NAME` capability |

A record must carry `url` **or** `screen` (or at minimum a `screenshot`);
records with none of the three are ignored.

## Mobile record example

```json
{
  "scenario": "Pay with a valid credit card",
  "scenarioUri": "features/checkout.feature",
  "scenarioLine": 12,
  "tags": ["@REQ-1042", "@mobile", "@android"],
  "stepIndex": 1,
  "keyword": "When",
  "step": "I submit payment with a valid card",
  "status": "passed",
  "screen": "com.example.shop/.checkout.PaymentActivity",
  "screenshot": "bdd-artifacts/flow/pay-with-a-valid-credit-card/001-i-submit-payment.png",
  "timestamp": "2026-09-08T11:00:03.000Z",
  "platform": "android",
  "driver": "appium",
  "device": "Pixel 7 API 34"
}
```

## How identity is derived

- **Web**: the URL path, with the origin dropped, the query dropped, and
  numeric / UUID / long-hex segments collapsed (`/orders/1234` -> `/orders/:id`).
- **Mobile**: the screen name with its package prefix dropped, so
  `com.example.shop/.checkout.PaymentActivity` becomes `PaymentActivity`. Pass
  `--full-screens` to keep the qualified name.
- **Hybrid / WebView**: record **both** `screen` (the native host) and `url` (the
  WebView location). `url` wins, so the WebView appears as a web page inside the
  native journey - mention that in the report so the reader is not surprised.
- A capture set where every record is native is reported as "screens" instead of
  "pages", in whichever language `--labels` selects.

## Ordering

Steps are ordered by `stepIndex` when both records have one, otherwise by
`timestamp`. Provide `stepIndex` - it is stable under parallel execution and
under identical timestamps, which do occur for fast steps.

## Grouping

Scenarios are grouped by `scenarioUri` + `scenarioLine` + `scenario`. Two runs
of the same scenario in one capture directory therefore merge into one journey,
and transition counts add up. Start from an empty capture directory when each
run must be reported separately.

**Keep the two lanes' captures in separate directories.** A `@web` and a
`@mobile` scenario at the same file and line group into one journey, producing a
diagram that jumps between URL pages and native screens. Point `BDD_FLOW_DIR` at
`bdd-artifacts/flow` for the web lane and `bdd-artifacts/flow-mobile` for the
mobile lane, and generate one report each.

## Guarantees the hook must provide

1. **Never fail the test.** Wrap the whole capture in try/catch and log a
   warning. A missing screenshot is a diagnostics gap, not a test result.
2. **Never block on the network.** Screenshot the current state; do not wait for
   idle, do not retry. On mobile this matters more: a screenshot round-trip to a
   device is slow, and retrying it doubles the cost of every step.
3. **Off by default.** Only capture when `BDD_FLOW_CAPTURE=1`.
4. **Bounded filenames.** Slugify scenario and step text, lowercase, non
   alphanumerics to `-`, truncate to about 60 characters. Keep the numeric
   prefix so files sort in step order.
5. **One directory per scenario** so a large run stays navigable.

## Sensitive data

Screenshots and URLs are the risk, not the schema. A suite running against a
shared environment will capture whatever is on screen.

- Do not put credentials, tokens, personal data or full page HTML into the record.
- Keep the capture directory git-ignored; it is written unencrypted.
- Mask fields in the application's test environment where possible, rather than
  post-processing screenshots.

## Extending the record

Extra fields are ignored by the generator, so adding project-specific data is
safe (`buildId`, `commit`, `viewport`, `httpStatus`). Do not repurpose an
existing field name for a different meaning.
