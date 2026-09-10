# Specification review checklist

Give this to the person signing off, translated into their language.

## 1. Completeness

- Which requirements in your backlog do **not** appear in the traceability
  matrix? Those have no specified behaviour at all.
- For each requirement in the matrix: do the listed scenarios cover the whole
  requirement, or only its happy path?
- Are the deliberately-excluded cases written down (in the feature description),
  or only in someone's memory?

## 2. Correctness

- Read the scenario names alone first. Do they read as a list of promises the
  product makes? Anything you would not promise is wrong.
- For each scenario: are the `Given` conditions ones that really occur in production?
- Are the expected outcomes what the business wants, or what the current
  implementation happens to do?

## 3. Data realism

- Money: correct currency, realistic amounts, tax handling stated.
- Dates: timezone stated where it matters; boundary dates present.
- Names, addresses, ids: shaped like real data, including non-Latin cases if
  your users have them.
- Absent from the specs: any real customer data. Examples must be synthetic.

## 4. Risk

- Which scenarios describe irreversible actions (money movement, deletion,
  outbound notifications)? Those need the unhappy paths specified too.
- Which listed tags mean "not automatically verified" (`@manual`, `@wip`,
  `@flaky`)? Accept them explicitly or ask for automation.
- Are permission rules specified for every role that can reach the capability?

## 5. Sign-off record

Record the decision where the team can find it later - a comment in the ticket,
or a block at the top of the feature file:

```gherkin
# Reviewed and approved: 2026-09-08, <reviewer role>, spec-report of 2026-09-08.
# Open item: partial refunds deferred to the next release.
```

Include: the date, who approved, which generated report they saw (the report
footer carries its generation timestamp), and any item accepted as an exception.

## Common review outcomes and the follow-up action

| Finding | Next step |
|---|---|
| A rule is wrong | `discover` - re-mine that rule, rewrite the scenarios |
| A case is missing | `discover` - add the example to the existing feature |
| A requirement has no scenarios | `discover`, then re-run this report |
| Scenarios are fine, nothing runs them | `bootstrap` then `run` |
| Data model questions raised in review | `export-ddl` to derive the schema from the agreed scenarios |
