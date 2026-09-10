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

## One sentence, one meaning

**A step sentence may carry exactly one meaning across the whole suite.** The
same words must never be setup in one place and an assertion in another.

This is not a style preference - it is a property of how cucumber works. Step
definitions are matched on the **text**, and the text alone. `Given`, `When`
and `Then` are not part of the match, and a step definition's body cannot see
which keyword invoked it. So this feature file cannot be implemented:

```gherkin
# Broken - the same sentence has to do two opposite things
Scenario: A blank title is rejected
  Given 我的待办清单是空的        # asks the step to EMPTY the list
  When 我添加待办 "   "
  Then 系统提示 "请输入待办内容"
  And 我的待办清单是空的          # asks the same step to ASSERT it is empty
```

One function is now expected both to truncate the table and to assert against
it. Whichever it does, the other reading is silently wrong: if it clears, the
`Then` proves nothing; if it asserts, the `Given` sets nothing up.

The fix is wording, not machinery. Give the two meanings two sentences:

```gherkin
Scenario: A blank title is rejected
  Given 我的待办清单是空的
  When 我添加待办 "   "
  Then 系统提示 "请输入待办内容"
  And 清单中没有任何待办
```

**Do not solve this in the glue.** It is technically possible to record the
pickle step's type in a `BeforeStep` hook and branch on it, and it is the wrong
answer twice over: the reader of the feature file still meets one sentence
meaning two things, and the step definition now depends on where in a scenario
it was called from, which no other step does.

### Catching it before it reaches the step definitions

Group the step text by its **effective** keyword - `And` and `But` inherit the
keyword above them, so resolve those first - and look for any sentence that
appears under both a setup keyword (`Given`, or a `Background` step) and
`Then`. That intersection should be empty.

It is worth doing deliberately, because the collision is invisible while the
feature file is being read for its content: both lines look natural where they
sit, and the problem only exists in the space between them. It usually surfaces
at the worst moment - when someone is writing the glue and has to decide, alone,
what the sentence means.

Two habits keep the intersection empty:

- **Setup describes the world; assertions describe what is on the screen.**
  `我的待办清单是空的` is a fact about the system; `清单中没有任何待办` is an
  observation of the list. Different subjects, so different sentences.
- **Never reuse a `Given` sentence as a `Then` "nothing changed" check.** That
  check is its own assertion and deserves its own words.

## Block keywords, and their synonyms

The table above covers step keywords. The block keywords have synonyms, and
picking between them is a readability decision, not a behavioural one - the
parser produces an identical AST either way, keeping only the word you wrote so
reports can echo it back.

| Keyword | Synonyms | Use |
|---|---|---|
| `Scenario` | `Example` | **Always `Scenario`**, including inside a `Rule` |
| `Scenario Outline` | `Scenario Template` | Prefer `Scenario Outline`; there is no `Example Outline` |
| `Examples` | `Scenarios` | **Always `Examples`** for an outline's data table |
| `Rule` | - | No synonym |
| `Background` | - | No synonym |

Pick one of each pair and hold to it across the suite. A file that mixes
`Scenario Outline` with `Scenario Template` costs a reader a double-take for
nothing.

This pairing is chosen for a reason worth stating, because the other one is
tempting. Each pair holds a singular that names a scenario and a plural that
names an outline's data table, one `s` apart: `Example:` / `Examples:` and
`Scenario:` / `Scenarios:`. Taking `Scenario` and `Examples` splits the pairs,
so the two words this suite actually writes are not a near-miss of each other -
`Example:` and `Scenarios:` are simply never written, and there is nothing left
to confuse. Keeping a pair together - `Scenario` with `Scenarios`, or `Example`
with `Examples` - puts two nearly identical keywords a few lines apart inside
every outline.

`Examples` is also what Cucumber's own documentation, most tutorials and most
editor snippets use, so nobody arriving from outside has to adjust.

What must not happen is a suite that mixes both members of a pair.

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
  step definitions and generated DDL stay consistent (`export-ddl` reads these).
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

Group scenarios that illustrate the same business rule. Write `Scenario:`
inside a `Rule` exactly as at feature top level - `Example:` parses identically
and reads well next to `Rule:`, but one keyword for one concept costs a reader
less than a rule about which synonym goes where. Indentation already says
whether a scenario belongs to a rule.

```gherkin
Rule: A cart may hold at most 20 items
  Scenario: Adding the 20th item succeeds
  Scenario: Adding the 21st item is rejected with a limit message
```

The scenarios under a `Rule` are still the green cards of the Example Mapping
session they came from (`example-mapping.md`); the keyword just does not need to
restate it.

`Rule:` may carry its own `Background:` which applies only inside the rule. Note
that a `Rule` `Background` runs **in addition to** the feature's `Background`,
not instead of it.

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
