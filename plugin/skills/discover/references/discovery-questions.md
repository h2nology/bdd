# Discovery question checklist

Walk these categories against every rule. Each unanswered question is a red
card; each answer usually becomes a scenario. Ask the user only the questions
whose answers change the scenarios - batch them in one message.

## Actors and permissions

- Who performs this? Who else can? Who must not?
- What happens for an unauthenticated visitor, a logged-in non-owner, an admin?
- Does the action need approval by a second person?

## Arrival and navigation

Only for a requirement that puts something on a screen. Ask it **before** the
feature file exists: how a person reaches a screen is behaviour, so it is a rule
and an example like any other, not stage directions around the examples that
follow.

- Does this requirement introduce a screen that is not there yet? Run
  `spec-report.cjs features/` for the inventory of what already exists rather
  than assuming.
- **From which existing screen does a person reach it, and by clicking what?**
  "From the roster" is not an answer; "the 登记新生 button on the roster" is.
- Where does a person land on success? On cancel? Can they get back?
- Is it reachable only by a direct URL - a deep link, an emailed link, a
  bookmark? **That is a legitimate answer.** The reason to ask is that it has to
  be said, rather than left as the default nobody chose.
- Does something that already exists now need a new way in or out? A new screen
  usually adds a control to an old one.

Each answer becomes its own example, and that example has to **click**. A
scenario that arrives by navigating to a URL exercises the page and proves
nothing about whether a person could have got there: a step definition reaches
every route regardless of what the application links to, so a screen nobody can
navigate to still goes green.

## Preconditions and state

- What must already exist for this to be possible?
- What if the entity is in a state that forbids it (cancelled order, closed account,
  archived record, expired token)?
- What if a prerequisite exists but is stale (price changed since the cart was filled)?

## Data boundaries

- Empty: zero items, blank string, no results.
- One: the smallest non-trivial case.
- Many / maximum: page size, upload limit, character limit, quantity cap.
- Just below / just above every threshold that appears in the rule.
- Wrong shape: negative amount, future date where past is required, wrong currency,
  unsupported file type, duplicate unique value.
- Locale: decimal separator, timezone, non-Latin names, right-to-left text.

## Outcomes

- What does the user see on success? Where do they land?
- What is written where (record created, event published, email/SMS sent, audit log)?
- Is the operation idempotent? What happens on a double submit or a retry?
- What is *not* allowed to happen (money moved twice, two accounts with one email)?

## Failure and recovery

- What if a downstream service is slow, down, or returns an error?
- Is the failure recoverable by the user, and how? What state are they left in?
- What is rolled back, and what stays?
- What does the user see - which message, in which language?

## Time

- Does the behaviour depend on now, business hours, a deadline, or a schedule?
- What happens exactly at the boundary (23:59:59, month end, DST change)?
- Does anything expire? What triggers the expiry - a job, or the next read?

## Non-functional constraints worth a scenario

Only turn these into scenarios when the requirement makes them observable
behaviour (a stated limit, a visible message), not as generic performance tests:

- Rate limits and lockouts ("after 5 failed attempts").
- Data retention and masking ("card number shows only the last 4 digits").
- Accessibility statements that are part of the acceptance criteria.

## Questions to ask the user, not the code

- Which of these cases matter for this release, and which are deliberately out of scope?
- Is there an existing requirement id / ticket for this? (needed for traceability tags)
- Who reviews the feature file - and in which language should the review report be?
