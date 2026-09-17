# Example Mapping

A 25-minute conversation format (Matt Wynne) that turns one requirement into a
shared understanding. Four card colours:

- **Yellow - Story**: the requirement being discussed. Exactly one per session.
- **Blue - Rule**: an acceptance criterion / business rule that constrains the story.
- **Green - Example**: a concrete, data-carrying illustration of one rule.
- **Red - Question**: an unknown nobody in the room can answer.

## Running it solo (what this skill does)

The assistant plays all three amigos and then submits the result for review:

1. **Business (product) hat** - restate the story as a user-visible outcome and
   the reason it matters. If the requirement has no "so that", the value is
   unstated: ask.
2. **Development hat** - for each rule, ask what the system must decide, what
   state it must read, and what it must write. Rules that cannot be decided from
   available data become red questions.
3. **Testing hat** - attack each rule with boundaries, absent data, duplicates,
   permissions, concurrency, and failure of downstream systems. Each attack that
   the rules do not answer becomes a red question; each attack the rules do
   answer becomes a green example.

## Reading the shape of the result

The card layout diagnoses the requirement before a line of code is written:

| Shape | Diagnosis | Action |
|---|---|---|
| Many red questions | Requirement is not ready | Stop; put the questions to the user |
| One rule, many examples | Examples are probably duplicates | Merge into a `Scenario Outline` |
| Many rules, no examples | Rules are abstract, unverified | Write one example per rule |
| Rules with no shared vocabulary | Domain language is not agreed | Fix the glossary first |
| More than ~6 rules | Story is too big | Split into several stories/features |

## From cards to Gherkin

| Card | Gherkin |
|---|---|
| Story | `Feature:` name + description (`As a ... I want ... so that ...`) |
| Rule | `Rule:` block, or a feature file of its own when it stands alone |
| Example | `Scenario:` (or one row of a `Scenario Outline`) |
| Question | Never becomes Gherkin - it becomes a question to the user, or a stated assumption recorded in the feature description |

Keep the mapping traceable: the rule a scenario illustrates should be obvious
from either the enclosing `Rule:` block or the scenario name.

## Recording assumptions

When the user cannot answer a red question and work must continue, write the
assumption into the feature description so reviewers see it:

```gherkin
Feature: Refund a paid order
  Assumption (unconfirmed 2026-09-08): refunds are always issued to the original
  payment method; partial refunds are out of scope for this release.
```

Remove the note once the answer arrives.
