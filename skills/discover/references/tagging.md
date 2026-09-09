# Tag conventions

Tags are the traceability backbone of this plugin. The `/bdd:spec-report` command and
`run` read them to build the requirement matrix, so their shape matters.

## Requirement id tags (required)

Recognized automatically by the reporting scripts - the prefix, an optional
`-`, `_` or `:` separator, then the id:

`@REQ-1042` `@REQUIREMENT-1042` `@US-17` `@STORY-17` `@AC-3`
`@JIRA-PAY-88` `@ISSUE-451` `@TICKET-90`

Project-specific prefixes work too, by passing them to the scripts:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/coverage.cjs features/ --req-prefix PAY --req-prefix OPS
```

Rules:

- Tag at **scenario level** for precise traceability.
- A feature-level requirement tag is **inherited by every scenario in the file**
  (and a `Rule:` tag by every scenario in that rule). This is correct when the
  whole file serves one requirement, but it means one failing scenario marks the
  whole requirement failed. Prefer scenario-level tags when a file spans
  several requirements.
- One scenario may carry several requirement tags when it genuinely satisfies
  several acceptance criteria.
- Never invent a requirement id. If the user has no backlog id, ask; if they
  confirm there is none, use a stable slug id (`@REQ-checkout-discount`) and
  record it in the requirement backlog file.

## Requirement backlog file (recommended)

Coverage can only report "a requirement with no scenario at all" when it knows
the full backlog. Keep a file - `docs/requirements.md` or wherever the team
already keeps it - listing every requirement. It belongs in version control next
to the specs: it is a source document, not a generated one, so never put it in
`bdd-artifacts/`, which is git-ignored and cleared between runs.

```markdown
- REQ-1042 | Shopper can pay with a credit card
- REQ-1043 | Declined payments show a recoverable error
- REQ-1044 | Shopper can apply a discount code
```

`.json` (array of strings or `{id,title}` objects), `.csv`, `.txt` and `.md`
lists all parse. Pass it as `--requirements <file>`.

## Lane tags

One feature file serves both delivery lanes, so say which one a scenario runs in.
The two lanes use different drivers and different step definitions, and each runs
as its own job:

`@web` - a browser, driven by Playwright
`@mobile` - a device or emulator, driven by Appium; add `@android` / `@ios` when
the scenario is platform-specific

Rules:

- A scenario with neither tag runs in the web lane (the default).
- The same requirement tag may appear on a `@web` and a `@mobile` scenario; the
  coverage report then shows the requirement verified on both platforms.
- Do not tag a scenario `@web @mobile` unless the same step definitions really
  work in both lanes. Loading both lanes' glue in one run makes shared step
  phrasings ambiguous.

## Layer tags

Say which level of the pyramid a scenario runs at, so the suite can be filtered:

`@ui` (browser or app UI) · `@api` (HTTP, no UI) · `@unit` · `@contract`

Most Gherkin should not be `@ui`. Push a scenario down to `@api` unless the
requirement is about what the user sees or does in the interface.

## Lifecycle tags

`@smoke` - minimal set that must pass before anything else
`@regression` - scenario added because of a defect (keep the `@BUG-…` tag too)
`@wip` - being written; excluded from CI runs
`@manual` - cannot be automated; excluded from execution but still counted in the spec report
`@flaky` - quarantined; must carry an owner and an issue link in a comment

## Data / environment tags

`@seed:catalogue` - needs a named fixture set
`@viewport:phone` - web lane, must run at a phone viewport (Playwright emulation)
`@device:pixel-7` - mobile lane, must run on a named device profile
`@slow` - long-running; excluded from the fast feedback loop. Most `@mobile`
scenarios are slow by nature - session startup dominates - so do not tag them all

## Anti-patterns

- Tags that duplicate the feature name (`@checkout` on `Feature: Checkout`) -
  they add noise to the tag index without adding a filter.
- Tags used as documentation prose (`@must-work-before-friday`).
- Tag names differing only by case or separator (`@REQ-1042` vs `@req_1042`);
  the reports treat them as different ids.
- Tagging `@manual` and then automating the scenario without removing the tag.
