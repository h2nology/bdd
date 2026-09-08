# Gherkin style rules

## Keyword semantics

| Keyword | Means | Rule |
|---|---|---|
| `Given` | Past / already-true state | Never an action the user takes in this scenario |
| `When` | The single behaviour under test | Exactly one `When` group per scenario |
| `Then` | Observable outcome | Assertion only; never changes state |
| `And` / `But` | Continuation of the previous keyword | Never starts a new phase |
| `*` | Bullet form of the previous keyword | Use sparingly, only in long `Given` lists |

A scenario with two `When`s separated by `Then`s is two scenarios, unless the
requirement is genuinely about a sequence (then say so in the scenario name).

## Declarative, not imperative

Write what the user achieves, not which widget they touch:

```gherkin
# Bad - encodes the UI, breaks on every redesign
When I click "#login-btn"
And I fill "input[name=email]" with "alice@example.com"

# Good - encodes the behaviour
When I sign in as "alice@example.com"
```

Exception: when the requirement *is* about the interaction (keyboard navigation,
drag and drop, a specific error placement), the mechanics belong in the step text.

## Names

- Scenario name states the outcome, not the steps: `Declined card leaves the cart intact`.
- Do not number scenarios (`Scenario 1`). Names are read in reports.
- Feature name is a capability (`Checkout`), not a screen (`Checkout page`) and
  not a layer (`Checkout API`).

## Feature description

Use the three-part form so the value is explicit:

```gherkin
Feature: Discount codes
  As a shopper
  I want to apply a discount code at checkout
  So that I pay the advertised promotional price
```

## Background

- Only shared, incidental setup. If a scenario does not need it, it does not belong.
- Never put a `When` or `Then` in a `Background`.
- Keep it to about 4 steps; more usually means the setup should move into one
  higher-level step (`Given a store with the standard catalogue`).

## Data tables

Use a table when the same step needs several rows or several fields:

```gherkin
Given the following users exist:
  | email             | role   | status  |
  | alice@example.com | admin  | active  |
  | bob@example.com   | member | invited |
```

- Header row names the fields; keep header names identical across features so
  step definitions and generated DDL stay consistent (`ddl` reads these).
- Escape a literal pipe as `\|` and a newline as `\n`.

## Doc strings

Use for multi-line payloads and expected text:

```gherkin
Then the receipt contains:
  """
  Blue mug x2
  Total: 25.00
  """
```

A media type may follow the fence (`"""json`).

## Scenario Outline

Same behaviour, different data - never unrelated cases in one table:

```gherkin
Scenario Outline: Password must meet the strength policy
  When I register with password "<password>"
  Then registration is "<result>" because "<reason>"

  Examples:
    | password    | result   | reason               |
    | short       | rejected | too short            |
    | alllowercase| rejected | missing a digit      |
    | Str0ng!pass | accepted | meets the policy     |
```

Put the placeholder in the scenario name when the rows need distinguishing in
reports: `Scenario Outline: "<password>" is <result>`.

## Rule blocks

Group scenarios that illustrate the same business rule:

```gherkin
Rule: A cart may hold at most 20 items
  Example: Adding the 20th item succeeds
  Example: Adding the 21st item is rejected with a limit message
```

`Rule:` may carry its own `Background:` which applies only inside the rule.

## Feature files in other languages

This is the default, not a special case: the prose is written in the language the
team speaks, because the people who sign off the rules have to be able to read
them. The **keywords stay English**, so no `# language:` header is needed:

```gherkin
Feature: 購入手続き

  @REQ-1042 @web
  Scenario: 商品を1点購入する
    Given 登録済みの顧客としてログインしている
    And カートに "ESP-100 エスプレッソカップ" が 12.50 円で入っている
    When 注文を確定する
    Then 注文合計は 42.50 円になる
```

Keywords are syntax rather than prose, which is why they sit on the English side
with the tags: editor highlighting and IDE completion key off them, and every
cucumber implementation supports the English set best.

Tags stay English too - `@REQ-1042`, `@web`, `@wip` are keys the coverage and
spec reports match on, and they must not change with the prose. Step definitions
have to match the localized step text character for character; the `init` skill's
language references have a section on writing them.

**Localized keywords** (`機能:` / `功能:` / `場景:`) are still parsed - dialects
`en`, `zh-CN`, `zh-TW`, `ja`, selected with a `# language:` header on the first
line. Follow that style when a repo already uses it, but do not start a new suite
with it.

## Size limits that keep suites maintainable

- <= 10 steps per scenario (including `Background`).
- <= 10 scenarios per feature file; split by `Rule` or capability beyond that.
- Every scenario runnable independently and in any order - no scenario may
  depend on state left by another.
