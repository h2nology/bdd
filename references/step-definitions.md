# Making a step definition fail for the right reason

The outer loop rests on one thing: a scenario that fails **because the
behaviour is missing**, and whose failure says so. This file is about getting
that failure, in each of the four stacks this plugin supports.

`init` sets up the harness and the World; this is about what goes inside a step
once it exists.

## What a valid RED looks like

Four conditions, all of them:

1. **Every step is defined.** No step is `undefined`.
2. **The failure comes from an assertion**, not from an exception the step
   threw on its way to doing nothing.
3. **The message names the outcome** - what was expected, against what actually
   happened, or which thing could not be found.
4. **Nothing else in the suite broke.** The failure is this scenario's missing
   behaviour, not a fixture, a dependency or a regression.

## Why `undefined` is not RED

An `undefined` step means cucumber found no code matching that sentence. The
run is red on the report, so it is easy to accept as the gate - but it says
nothing about the system. It says nobody has written the step yet.

Accepting it as RED skips the only moment anyone is forced to state precisely
what the sentence means. That statement is the step definition's assertion, and
writing it is where a feature file's ambiguities surface - which is exactly what
you want to happen before the code is written, not after.

## Given, When, Then fail differently

Which keyword the failure comes from tells you whether the gate is passed.

| Keyword | What it does | A failure here means |
|---|---|---|
| `Given` | Puts the system into a known state. Asserts nothing. | **The setup is broken.** Not RED - fix the fixture. |
| `When` | Performs the one behaviour under test. Asserts nothing. | Usually the setup or the entry point is broken. Not RED, unless the action itself is what does not exist yet. |
| `Then` | Observes the outcome. **Only this asserts.** | **This is RED.** The behaviour is missing or wrong. |

So: put no assertions in `Given`. A `Given` that checks its own setup worked
turns a fixture problem into something that looks like a specification failure,
and the gate stops meaning anything.

The exception is worth naming: a `Given` may fail loudly if it genuinely cannot
establish the state - a seed that errors, a login that 500s. That is a broken
fixture reported honestly, and it is still not RED.

## What the first RED usually looks like at the UI layer

The first time a `Then` runs against a feature nobody has built, the element it
looks for does not exist. Playwright's assertions retry, so the failure arrives
as a timeout:

```
Timed out 5000ms waiting for expect(locator).toHaveText('42.50')
Locator: getByTestId('order-total')
Expected: '42.50'
Received: <element(s) not found>
```

**This is a valid RED.** The behaviour is genuinely absent, the assertion
produced the failure, and the message names what was expected. Accept it, and
say in `progress.md` that the element does not exist yet.

What is *not* acceptable is a bare timeout with no expectation in it - the
difference between the block above and `TimeoutError: page.click: Timeout
30000ms exceeded`. The second one came from a `When` that could not act; it
tells you the page is not reachable, not that the behaviour is wrong.

## Anti-patterns

These produce a red run, or a green one, without either meaning anything.

| Written like this | What actually happens |
|---|---|
| `throw new Error('not implemented')` | Red, but it is `undefined` wearing a costume. Nothing about the system was checked. |
| An empty body, or one that just logs | **Green.** The most dangerous of all: the scenario now reports the requirement as verified while asserting nothing. |
| `pending()` / `ScenarioContext.Pending()` | Reported as pending, not failed. Fine as a marker while writing; never the state you gate on. |
| Assertions inside `Given` | A fixture problem is dressed up as a behaviour failure. |
| `expect(result).toBeTruthy()` | Passes for `1`, `'error'`, `{}`. It cannot fail when the business rule changes, so it is not a test. |
| Asserting the value the step itself just set | A closed circle. It will be green before the production code exists. |
| `try { ... } catch { }` around the action | Swallows the failure and lets `Then` run against a system that never acted. |
| Reaching into internals to read the outcome | Green while the user-visible behaviour is still missing. Assert what the scenario says a person can observe. |

## The four stacks

Follow the World / context object `init` set up; these show only the shape of
the assertion. Step text is in the team's language, keywords stay English -
`skills/discover/SKILL.md` has the rule.

### TypeScript - `@cucumber/cucumber` + Playwright

```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { BddWorld } from './support/world';

Given('我的购物车中有 {string}，单价 {float} 元', async function (this: BddWorld, sku: string, price: number) {
  await this.page.getByTestId('sku-input').fill(sku);   // set state, assert nothing
  await this.page.getByTestId('add-to-cart').click();
});

When('我提交订单', async function (this: BddWorld) {
  await this.page.getByRole('button', { name: '提交订单' }).click();
});

Then('订单总额为 {float} 元', async function (this: BddWorld, total: number) {
  await expect(this.page.getByTestId('order-total')).toHaveText(total.toFixed(2));
});
```

`expect` from `@playwright/test` retries and reports expected against received.
For assertions that are not about the page, use `node:assert/strict` -
`assert.strictEqual(actual, expected)` names both sides; `assert.ok(value)` does
not.

### Java - `io.cucumber` + Playwright

```java
@Then("订单总额为 {double} 元")
public void 订单总额为(double total) {
    PlaywrightAssertions.assertThat(page().getByTestId("order-total"))
        .hasText(String.format("%.2f", total));
}
```

For non-web assertions use AssertJ, which `init` already adds:
`assertThat(order.total()).isEqualTo(new BigDecimal("42.50"))`. Prefer it over
`assertTrue(order.total().equals(...))`, which prints only `expected: true`.

### Python - `pytest-bdd` + Playwright

```python
from playwright.sync_api import expect
from pytest_bdd import given, when, then, parsers

@then(parsers.parse('订单总额为 {total:f} 元'))
def order_total(page, total):
    expect(page.get_by_test_id('order-total')).to_have_text(f'{total:.2f}')
```

For plain values, a bare `assert actual == expected` is enough - pytest rewrites
it and prints both sides. `assert result` prints nothing useful.

### C#/.NET - Reqnroll + Playwright

```csharp
[Then(@"订单总额为 (.*) 元")]
public async Task 订单总额为(decimal total) =>
    await Expect(_page.GetByTestId("order-total")).ToHaveTextAsync(total.ToString("0.00"));
```

`using static Microsoft.Playwright.Assertions;` for the web; FluentAssertions
elsewhere - `order.Total.Should().Be(42.50m)` reports both sides,
`Assert.True(...)` does not.

## When the assertion cannot be written yet

Sometimes the `Then` cannot be written because the scenario does not say
precisely enough what to observe - "the order is processed correctly", "the user
sees a reasonable message".

Do not pick a meaning and encode it. That is how a scenario ends up passing
against an assumption nobody agreed to, while reporting the requirement as
verified.

Record it under **Specification issues found while implementing** in
`findings.md`, and take it back to `discover`. The feature file is what has to
change.

## Which seam to drive

Step definitions should enter the system where a user does - the page for a web
scenario, the screen for a mobile one, the HTTP endpoint for an API scenario.

Driving something lower to make a scenario pass faster - calling the service
class directly, asserting on a repository - gives a green scenario over a
feature nobody can actually use. The suite then reports coverage the product
does not have, which is worse than reporting none.
