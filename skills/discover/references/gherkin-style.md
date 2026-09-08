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

## Localized feature files

Add the dialect header as the first line and keep one dialect per file:

```gherkin
# language: ja
機能: ログイン
  シナリオ: 正しいパスワードでログインする
    前提 ログイン画面を開いている
    もし ユーザー名とパスワードを入力する
    ならば ホーム画面が表示される
```

Dialects supported by this plugin's parser and reports: `en`, `zh-CN`, `zh-TW`, `ja`.

## Size limits that keep suites maintainable

- <= 10 steps per scenario (including `Background`).
- <= 10 scenarios per feature file; split by `Rule` or capability beyond that.
- Every scenario runnable independently and in any order - no scenario may
  depend on state left by another.
