# TypeScript / JavaScript: cucumber-js + Playwright

Verified against `@cucumber/cucumber` 11.x/12.x and `playwright` 1.4x. Check the
versions the project actually installs before copying config verbatim.
> **Lane**: this file is the **web lane** - cucumber + Playwright against a
> browser. Native/hybrid mobile apps and real devices are the mobile lane:
> `appium.md`. Responsive web at a phone viewport stays here: `responsive-web.md`.


## 1. Dependencies

```bash
npm i -D @cucumber/cucumber playwright tsx typescript @types/node
npx playwright install chromium   # add firefox webkit if BDD_BROWSER will use them
```

JavaScript-only project: drop `tsx`, `typescript`, `@types/node`, write the
support files as `.mjs`, and remove the `tsx-register.mjs` import from the config.

## 2. Layout

```
features/
  checkout.feature
  step_definitions/
    checkout.steps.ts
  support/
    env.ts             # environment contract
    world.ts           # Playwright-backed World
    hooks.ts           # Before / AfterStep / After
    flow-capture.ts    # writes bdd-artifacts/flow/flow.ndjson
cucumber.mjs
tsx-register.mjs
```

## 3. `tsx-register.mjs`

cucumber-js does not transpile TypeScript itself; register a loader first.
This exact pattern is what the cucumber-js transpiling docs prescribe for ESM.

```javascript
import { register } from 'tsx/esm/api';
register();
```

## 4. `cucumber.mjs`

```javascript
export default {
  // No `paths` key on purpose - see the note below.
  import: [
    './tsx-register.mjs',
    'features/support/**/*.ts',
    'features/step_definitions/**/*.ts',
  ],
  format: [
    'summary',
    'message:bdd-artifacts/cucumber.ndjson',
    'html:bdd-artifacts/cucumber.html',
  ],
  formatOptions: { snippetInterface: 'async-await' },
  tags: 'not @wip and not @manual',
  retry: 0,
  parallel: 0,
  worldParameters: {},
};
```

- **Do not add a `paths` key.** cucumber-js already defaults to
  `features/**/*.feature`, and setting `paths` in the config makes it ignore a
  path passed on the command line: `npx cucumber-js features/checkout.feature`
  then runs the whole suite instead of that one file, silently. Without the key,
  the positional argument filters as expected. This matters because the
  `implement` skill needs a command that runs exactly one feature; the
  alternative - a union of tags - has to be edited by hand every time a scenario
  is added, and under-tests the feature when somebody forgets.
- `message:` ndjson is the input `coverage.cjs` prefers - always keep it.
- Raise `parallel` only after the suite is stable; the flow capture appends to a
  single ndjson file, which is append-safe per line but interleaves scenarios
  (flow-map re-groups them by scenario, so this is fine).
- `retry` > 0 produces several executions of one scenario; coverage aggregates
  them worst-wins, so a flaky-passing scenario still shows its failure.

## 5. `features/support/env.ts`

```typescript
export interface BddEnv {
  baseUrl: string;
  browserName: 'chromium' | 'firefox' | 'webkit';
  headed: boolean;
  slowMo: number;
  device?: string;
  timeout: number;
  flowCapture: boolean;
  flowDir: string;
  trace: 'off' | 'on' | 'retain-on-failure';
}

export const env: BddEnv = {
  baseUrl: process.env.BDD_BASE_URL ?? 'http://localhost:3000',
  browserName: (process.env.BDD_BROWSER as BddEnv['browserName']) ?? 'chromium',
  headed: process.env.BDD_HEADED === '1',
  slowMo: Number(process.env.BDD_SLOWMO ?? 0),
  device: process.env.BDD_DEVICE || undefined,
  timeout: Number(process.env.BDD_TIMEOUT ?? 30000),
  flowCapture: process.env.BDD_FLOW_CAPTURE === '1',
  flowDir: process.env.BDD_FLOW_DIR ?? 'bdd-artifacts/flow',
  trace: (process.env.BDD_TRACE as BddEnv['trace']) ?? 'off',
};
```

## 6. `features/support/world.ts`

```typescript
import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import type { Browser, BrowserContext, Page } from 'playwright';

export class BddWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  /** Incremented by the AfterStep hook so capture filenames stay ordered. */
  stepIndex = 0;
  /** Slug of the running scenario; set by the Before hook. */
  scenarioSlug = '';

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(BddWorld);
```

## 7. `features/support/flow-capture.ts`

Writes the records `flow-map.cjs` consumes. Keep the field names exactly as
specified in the capture contract.

```typescript
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from 'playwright';
import { env } from './env';

/**
 * Filename-safe, and **not** ASCII-only: `\p{L}` keeps CJK, Cyrillic, accented
 * Latin and everything else a team writes scenario names in. Stripping them
 * instead collapses every non-Latin name to the same fallback, so traces and
 * flow screenshots overwrite each other and only the last failure survives.
 */
export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';
}

export interface CaptureInput {
  page: Page;
  scenario: string;
  scenarioUri?: string;
  tags: string[];
  stepIndex: number;
  keyword: string;
  step: string;
  status: string;
  scenarioSlug: string;
}

export async function captureStep(input: CaptureInput): Promise<void> {
  if (!env.flowCapture) return;
  try {
    const file = join(env.flowDir, 'flow.ndjson');
    const shot = join(env.flowDir, input.scenarioSlug,
      `${String(input.stepIndex).padStart(3, '0')}-${slugify(input.step)}.png`);
    mkdirSync(dirname(shot), { recursive: true });
    mkdirSync(dirname(file), { recursive: true });
    await input.page.screenshot({ path: shot, fullPage: false });
    appendFileSync(file, JSON.stringify({
      scenario: input.scenario,
      scenarioUri: input.scenarioUri ?? null,
      tags: input.tags,
      stepIndex: input.stepIndex,
      keyword: input.keyword,
      step: input.step,
      status: input.status,
      url: input.page.url(),
      title: await input.page.title().catch(() => ''),
      screenshot: shot,
      timestamp: new Date().toISOString(),
      device: env.device ?? 'desktop',
    }) + '\n');
  } catch (error) {
    // Capture is diagnostics, never a reason to fail a scenario.
    console.warn('[bdd] flow capture failed:', (error as Error).message);
  }
}
```

## 8. `features/support/hooks.ts`

```typescript
import {
  After, AfterAll, AfterStep, Before, BeforeAll, Status, setDefaultTimeout,
} from '@cucumber/cucumber';
import { chromium, firefox, webkit, devices, Browser } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env';
import { BddWorld } from './world';
import { captureStep, slugify } from './flow-capture';

setDefaultTimeout(env.timeout);

let browser: Browser;

const launcher = () => ({ chromium, firefox, webkit }[env.browserName] ?? chromium);

BeforeAll(async function () {
  browser = await launcher().launch({ headless: !env.headed, slowMo: env.slowMo });
});

AfterAll(async function () {
  await browser?.close();
});

Before(async function (this: BddWorld, { pickle }) {
  // A device profile emulates a phone viewport (UA, touch, scale factor).
  // Real devices are the Appium lane - see appium.md.
  const profile = env.device ? devices[env.device] : undefined;
  if (env.device && !profile) throw new Error(`Unknown BDD_DEVICE "${env.device}"`);

  this.browser = browser;
  this.context = await browser.newContext({ baseURL: env.baseUrl, ...(profile ?? {}) });
  if (env.trace !== 'off') {
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  this.page = await this.context.newPage();
  this.stepIndex = 0;
  this.scenarioSlug = slugify(pickle.name);
});

AfterStep(async function (this: BddWorld, { pickle, pickleStep, result }) {
  await captureStep({
    page: this.page,
    scenario: pickle.name,
    scenarioUri: pickle.uri,
    tags: (pickle.tags ?? []).map((t) => t.name),
    stepIndex: this.stepIndex++,
    keyword: String(pickleStep?.type ?? ''),
    step: pickleStep?.text ?? '',
    status: String(result.status).toLowerCase(),
    scenarioSlug: this.scenarioSlug,
  });
});

After(async function (this: BddWorld, { pickle, result }) {
  const failed = result?.status === Status.FAILED;
  if (failed && this.page) {
    const buffer = await this.page.screenshot({ fullPage: true }).catch(() => null);
    if (buffer) this.attach(buffer, 'image/png');
  }
  if (env.trace === 'on' || (env.trace === 'retain-on-failure' && failed)) {
    mkdirSync('bdd-artifacts/traces', { recursive: true });
    await this.context?.tracing.stop({ path: join('bdd-artifacts/traces', `${slugify(pickle.name)}.zip`) });
  } else if (env.trace !== 'off') {
    await this.context?.tracing.stop();
  }
  await this.context?.close();
});
```

`pickleStep.type` carries `Context` / `Action` / `Outcome` (the pickle has no raw
Gherkin keyword). That is enough to label a flow edge; use the step text as the
primary label.

## 9. Step definitions

Keep them thin: they translate domain language into page interactions, and hold
no assertions about implementation detail.

```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { BddWorld } from '../support/world';

Given('I am on the {string} page', async function (this: BddWorld, name: string) {
  const routes: Record<string, string> = { cart: '/cart', checkout: '/checkout', home: '/' };
  const route = routes[name];
  if (!route) throw new Error(`Unknown page "${name}" - add it to the route map`);
  await this.page.goto(route);
});

When('I sign in as {string}', async function (this: BddWorld, email: string) {
  await this.page.goto('/login');
  await this.page.getByLabel('Email').fill(email);
  await this.page.getByLabel('Password').fill(process.env.BDD_TEST_PASSWORD ?? 'test-password');
  await this.page.getByRole('button', { name: 'Sign in' }).click();
});

Then('I see the error {string}', async function (this: BddWorld, message: string) {
  await expect(this.page.getByRole('alert')).toContainText(message);
});
```

Notes:

- `expect` from `@playwright/test` gives auto-retrying web assertions; add
  `@playwright/test` as a dev dependency if the project does not already have it,
  otherwise use `expect` from `node:assert` and Playwright's own waiting APIs.
- Prefer role/label locators over CSS: they survive redesigns and encode accessibility.
- Never `page.waitForTimeout` in a step definition; wait for the state the step
  is about.

## 10. `package.json` scripts

```json
{
  "scripts": {
    "test:bdd": "cucumber-js",
    "test:bdd:headed": "BDD_HEADED=1 BDD_SLOWMO=250 cucumber-js",
    "test:bdd:responsive": "BDD_DEVICE='iPhone 15' cucumber-js",
    "test:bdd:mobile": "BDD_DRIVER=appium cucumber-js -p mobile",
    "test:bdd:flow": "BDD_FLOW_CAPTURE=1 cucumber-js",
    "test:bdd:smoke": "cucumber-js --tags '@smoke'"
  }
}
```

On Windows, prefix env vars with `cross-env` (`npm i -D cross-env`).

## 11. `tsconfig.json` additions

cucumber-js config files written in TypeScript do **not** honour `tsconfig.json`
(they use Node's built-in TS support), so keep `cucumber.mjs` in JavaScript. For
the support code:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["features/**/*.ts"]
}
```

## 12. Smoke check

```bash
mkdir -p bdd-artifacts
npx cucumber-js --tags '@smoke' || true
node "${CLAUDE_PLUGIN_ROOT}/scripts/coverage.cjs" features/ --results bdd-artifacts/cucumber.ndjson
```

The second command must report a non-zero number of executed cases. If it
reports orphan cases, the scenario names in the results do not match the specs -
usually a stale ndjson from a previous run; delete `bdd-artifacts/` and re-run.

## 13. Non-English step text

A feature file whose step text is not English needs step definitions that match
it. The keywords stay English, so nothing changes about how the glue is wired up
- only the text being matched.
Three things make this work, and one of them is a trap.

**The text is matched literally.** A cucumber expression is compiled to a regular
expression, and CJK characters in it are ordinary literals. Nothing special is
needed to match them.

**Parameter names stay English.** `{string}` and `{float}` match by position, not
by name, so the handler's parameters keep their English names while the step text
is not English. Only the text between the parameters has to match.

**The trap: ASCII punctuation is syntax.** In a cucumber expression, `(` `)` marks
optional text, `{` `}` marks a parameter, `/` marks alternatives and `\` escapes.
Full-width CJK punctuation - `，` `。` `（` `）` `：` - carries none of that meaning
and is safe. So write `单价 {float} 元` freely, but escape a half-width `(` as
`\(` if the step text really contains one. Mixing the two is where this bites:
`我的购物车中有 "ESP-100" (含税)` needs the parentheses escaped, `（含税）` does not.

```gherkin
Feature: 购物车结账

  @REQ-1042 @web
  Scenario: 为单件商品下单
    Given 我已作为注册顾客登录
    And 我的购物车中有 "ESP-100 浓缩咖啡杯"，单价 12.50 元
    When 我提交订单
    Then 订单总额为 42.50 元
```

```typescript
Given('我已作为注册顾客登录', async function (this: BddWorld) {
  await this.page.goto(`${this.baseUrl}/login`);
  // ...
});

Given('我的购物车中有 {string}，单价 {float} 元', async function (this: BddWorld, sku: string, price: number) {
  await this.api.seedCart({ sku, price });
});

Then('订单总额为 {float} 元', async function (this: BddWorld, total: number) {
  await expect(this.page.getByTestId('order-total')).toHaveText(total.toFixed(2));
});
```

Node reads and writes UTF-8 by default, so no extra configuration is needed. Keep
file and directory names ASCII even when their contents are not - `cucumber.js`
glob patterns and npm scripts are easier to keep portable that way.
