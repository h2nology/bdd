# Coverage model

## Vocabulary

| Term | Definition |
|---|---|
| Scenario | One `Scenario` / `Example` / `Scenario Outline` block in a feature file |
| Case | One executable instance: a plain scenario is 1 case; an outline is 1 case per `Examples` row |
| Execution | One result record for a case in a results file (a retry adds another execution) |
| Requirement | An id extracted from a tag (`@REQ-1042`) or declared in the backlog file |
| Declared requirement | A requirement listed in `--requirements`, whether or not any scenario covers it |

## Metrics

### Requirement coverage (specification side)

```
requirement coverage = requirements with >= 1 scenario / all known requirements
```

"All known requirements" = the union of the `--requirements` backlog and every
requirement id found in tags. **Without a backlog file the denominator can only
contain ids that are already tagged, so the result is always 100% and tells you
nothing.** Always ask for or create the backlog file before quoting this number.

### Execution coverage

```
execution coverage = scenarios with >= 1 execution / all scenarios in the specs
```

Scenarios excluded by a tag filter count in the denominator. This is deliberate:
a scenario nobody runs is not verified behaviour, whatever the reason.

### Pass rate

```
pass rate = executions with status passed / all executions
```

Computed over executions, not scenarios, so an outline with 5 rows contributes 5.

### Statuses

Step statuses come from the results file and normalize to:
`passed`, `failed`, `undefined`, `pending`, `skipped`, `ambiguous`, `unknown`.

A **scenario** status is worst-wins over its executions, in this order:

```
passed < skipped < pending < undefined < ambiguous < failed
```

A **requirement** status over its scenarios:

| Status | Meaning |
|---|---|
| `uncovered` | No scenario carries this requirement id |
| `not-executed` | Scenarios exist, none ran |
| `partial` | Some scenarios ran, some did not |
| `undefined` | A step is not implemented, so the behaviour is unverified |
| `failed` | At least one scenario failed |
| `passed` | Every scenario ran and passed |

`undefined` outranks `not-executed` on purpose: an unimplemented step is a
harness defect that hides a real gap, while "not executed" is usually a filter.

## How results are matched to specs

Matching is by name, in this order:

1. `feature uri + scenario name` - uri compared as the full relative path, the
   basename, and the part after `features/`, so absolute vs relative paths match.
2. `scenario name` alone.
3. JUnit XML only: the `classname` attribute, as a last resort.

For `Scenario Outline`, both the outline's own name and each expanded example
name are registered, so runners that substitute placeholders into the name and
runners that do not both match.

### Consequences to keep in mind

- **Two scenarios with the same name in the same file** collapse into one match.
  Keep scenario names unique; the spec report lists duplicates as separate rows,
  so a mismatch between the two reports is the signal.
- **Renaming a scenario invalidates old results.** The report lists the leftovers
  under "executed cases not found in specs".
- **JUnit XML carries no tags**, so requirement attribution comes entirely from
  the spec files. This is fine - tags live in the specs anyway - but a scenario
  missing from the specs cannot be attributed at all.
- **Cucumber messages ndjson is the best input**: it carries uri, name, tags,
  per-step statuses, error messages and durations.

## What this model does not measure

Be explicit about these when reporting; silence here is how coverage numbers
become misleading:

- **Not code coverage.** A passing scenario says nothing about which lines ran.
  Combine with the language's own coverage tool if the user needs that.
- **Not assertion strength.** A scenario whose `Then` asserts nothing meaningful
  still counts as covered. The spec report review (`/bdd:spec-report`) is
  where that is caught.
- **Not requirement completeness.** Coverage counts requirements that someone
  wrote down. A requirement nobody recorded is invisible to every metric here.
- **Not `@manual` execution.** Manually verified scenarios count in the
  specification and as `not-executed` in the run. Report them separately rather
  than letting them drag the number down without explanation.
