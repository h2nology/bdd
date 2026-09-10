---
description: Derive the UI a set of Gherkin features implies - every data state of every screen, with what each button and link does written on it - and render it as a read-only pan/zoom wireframe board, for review before any code is written.
argument-hint: "[feature paths] [--lang en|zh-CN|zh-TW|ja]"
---

# UI sketch from Gherkin

Derive the screens a feature implies and their wireframes, annotate every button
and link with what clicking it does and which scenario says so, and render it all
on a read-only Figma-style board.

Where this sits in the plugin:

| Step | Question it answers | Timing |
|---|---|---|
| `discover` | What should the system do? | first |
| **`/bdd:sketch`** | **What would that look like?** | **after the feature file is agreed, before code** |
| `/bdd:plan-with-feature` + `/bdd:implement` | Build it, capability by capability | next |
| `flow-map` | Which screens did the tests actually visit? | after a run |

**This board draws screens, not a flow.** What happens after a click goes in a
callout beside the page - joined to its button by a leader line, and stamped with
the scenario it came from - because that claim, not the arrow, is what a reviewer
argues about. The flow *diagram* belongs to `flow-map`, which draws it from a real
run. So never present a sketch as evidence of what the app does: here every
outcome is an inference from the wording, which is why each one names its
scenario.

Arguments the user gave: `$ARGUMENTS`

## What it is for

A feature file is agreed in words and then implemented into something nobody
pictured the same way. This board makes the disagreement surface in minutes, at
the point where it is still free to fix - and it does so **without becoming a
design**: greyscale wireframes, no brand, no polish, so the reviewer argues about
the content rather than the colours.

The single most valuable part of the output is `openQuestions`: the list of
things the feature file does not determine. Do not resolve those silently.

## Communication policy

- The spec JSON, element labels, `route` values, `step` text, `action.text` and
  `action.scenario` stay in **English** when the feature file is English - carry
  step text and scenario names **verbatim** so a reviewer can grep for them.
- Explain the board and the open questions to the user in **their** language, and
  localize the board chrome with `lang`.

## 1. Read the features

If the user named paths, use them. Otherwise let the parser fall back to its usual
roots (`features/`, `src/test/resources/features/`, `Features/`, `tests/features/`).

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs --input features --json bdd-artifacts/spec.json
```

The `--json` model gives the parsed scenarios, tags and `Examples:` tables, which
is what the derivation needs. Read the raw `.feature` text alongside it: wording
matters, and the derivation rules key off it.

If the project has no feature files, stop and offer `discover` (write scenarios)
instead of sketching an empty board.

Sketch one coherent slice at a time - a feature, or a `Rule` - not a whole suite.
A board with forty screens is not reviewable. If the paths given cover more than
that, say so and propose a slice.

## 2. Derive the spec

Follow `${CLAUDE_PLUGIN_ROOT}/references/wireframe-vocabulary.md`, which has the
element vocabulary, the step-wording-to-element rules, and the do-nots. Write the
result to `bdd-artifacts/sketch.json` in the format specified by
`${CLAUDE_PLUGIN_ROOT}/references/sketch-spec.md`.

The two contracts exist so the split holds:

- **You decide what is on a screen, and what each control does.** Gherkin says
  "submits payment", not "there is a card-number field"; that inference is a
  judgement call and it is yours.
- **The renderer decides where it goes.** Never write pixel coordinates - layout
  comes from `region` + array order + `width`, so regenerating the spec cannot
  make the board drift.

Three rules worth repeating because they are what makes the artefact trustworthy:

- Fill `step` on every element, verbatim from the feature. An element with no
  `step` and no `notes` entry is a design guess.
- **Fill `action` on every button and link**, as `{ text, scenario, source }`:
  where the click goes, named the way `route` names it, with the condition when
  the feature states one and both outcomes when it states two ("on success opens
  /checkout/done; a declined card stays here with an error alert") - **plus the
  `Scenario:` name it came from**, verbatim. The renderer reports a control with
  no `action`, and an `action` with no `scenario`, because a button whose outcome
  nobody wrote down, or a claim with no provenance, is exactly the gap this board
  exists to surface. If the feature does not say, write `"unspecified - see open
  questions"` and add the question.
- **One card per data state.** A page whose UI depends on data is several cards
  sharing a `route`, each with its own `state` - "empty", "card declined", "2
  items". They are drawn stacked inside one labelled group. Collapsing them into
  a single card hides the difference the reviewer is there to check, and gets the
  behaviour wrong, because the same button usually does something different in
  each state.
- Every gap goes in `openQuestions`, not into a confident invention. A state you
  suspect exists but no scenario describes is a question, not a card. The same
  goes for a destination: an `action` may not invent a page no scenario mentions.

## 3. Settle one thing with the user

Unless the request already names it:

- **`lang`** - the board chrome's language. Pick the **reviewer's** language,
  which is often not the developer's. Step text, element labels and routes are
  reproduced verbatim whatever this is set to.

`en` | `zh-CN` | `zh-TW` | `ja`. The board has no Korean chrome yet: a `ko`
request falls back to English, so say so rather than letting the reviewer wonder.

## 4. Render

Invoke the `html-report` skill with `mode=sketch`, passing the spec JSON from step
2 and the chosen `lang`. That skill's `sketch` mode section documents the argument
mapping and why that mode delegates rather than templating.

Default output path: `bdd-artifacts/sketch.html`, beside the other bdd artefacts.

The renderer can also be called directly, which is the same code path:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sketch.cjs \
  --input bdd-artifacts/sketch.json \
  --out bdd-artifacts/sketch.html \
  --json bdd-artifacts/sketch-layout.json \
  --labels zh-CN
```

| Option | Effect |
|---|---|
| `--input <file>` | Sketch spec JSON (default `bdd-artifacts/sketch.json`) |
| `--out <file>` | Output HTML (default `bdd-artifacts/sketch.html`) |
| `--json <file>` | The laid-out model: each screen's box and column, plus warnings |
| `--labels <tag>` | Board chrome language: `en` \| `zh-CN` \| `zh-TW` \| `ja` |
| `--title <text>` | Override the board title |
| `--viewport <v>` | Override `app.viewport`: `desktop` \| `tablet` \| `mobile` |

Exit codes: `0` board written, `2` the spec is missing, unparseable, or has no
screens. A `2` is a defect in the derivation, not in the renderer: fix the spec
and re-run. Everything else the renderer objects to - an unknown element type, a
button with no `action` - is a warning printed with the board, not a failure.

### How the board is laid out

A grid of pages, computed once in `sketch.cjs`: a near-square number of columns,
each page group dropped into the shortest column so a tall page does not strand
one. No layout engine, no CDN, no network - the file opens the same offline.

- Every page group carries a **gutter on its right** holding the action callouts
  of its cards. A callout sits level with the control it annotates, and is pushed
  down only when the one above it would overlap, so a leader line stays short and
  roughly horizontal. Because the callouts live in the group's own gutter, no
  leader ever crosses another page.
- Groups of state variants are drawn inside one labelled frame, so a page's
  states always read as a column.
- Groups holding an entry screen are placed first, so the board still starts
  where a journey does.
- The same spec always produces the same board, so a reviewer's mental map
  survives a regeneration.

### What reviewers can do

The board is **read-only** on purpose. It is a review artefact; the way to change
what it shows is to change the feature file and regenerate. Reviewers can:

- drag to pan, `⌘`/`ctrl` + wheel (or pinch) to zoom, `+` / `-` / `0` by keyboard
- click a screen to light it, the other states of the same page, and its action
  callouts with their leader lines - and see its state, purpose, source
  `feature:line`, tags, notes and the steps it was derived from
- click a callout to select the screen it annotates
- read every click behaviour of the selected screen in full in the detail panel,
  each with the scenario it came from - a callout clamps a very long one, the
  tooltip and the panel do not
- jump between a page's states from the detail panel
- press `Esc` or click the same screen again to clear the selection

## 5. Read the board before showing it

| Observation | What it usually means |
|---|---|
| A button or link with no `action` | The feature never says what clicking it does. The renderer warns about exactly this - answer it or make it an open question |
| A callout with no scenario in its footer | The claim has no provenance. The renderer warns about it: find the scenario, or admit the behaviour is invented |
| An `action` naming a page that has no card | Either a screen is missing from the sketch, or the destination is invented. Both are defects |
| An `action` that says only "submits" | Says nothing a reviewer can disagree with. Where does it go, and what happens when it fails? |
| Several callouts citing the same scenario on one page | Usually right - one scenario walks several controls. Worth a glance that they do not contradict each other |
| A page with only one state | Ask whether it really has one. Empty, error and loading states are the ones features forget |
| Two variants with identical wireframes | Over-splitting: they are the same state described twice. Merge them |
| Two variants whose buttons carry identical `action` text | Suspicious - if the states behave the same, why are they two cards? |
| A page no `action` anywhere leads to, and not an entry | The feature describes the page but never how the user reaches it |
| A screen whose elements have no `step` | Invention. Justify each one from the text or drop it |
| Many `openQuestions` on one screen | That screen's scenarios are underspecified - the most useful thing you can report |
| A failure outcome with no place to land | The failure path was written as an outcome but never as a screen or a state |
| A wireframe that looks obviously wrong | Good - that is the artefact working. Take it back to the feature file |

## 6. Report the numbers before claiming success

Give the user, in their language:

1. Counts: pages, state variants, annotated click behaviours, elements, open
   questions - and that this is derived from the text, not observed from a run.
2. Which pages have more than one state, and which have only one - the latter is
   usually where a state is missing rather than where none exists.
3. The board path, and that it opens offline with no network.
4. **The open questions, spelled out.** Do not bury them - they are the reason to
   sketch before building. Ask which ones they want to answer into the feature
   file now.
5. Any renderer warnings: buttons or links with no `action`, actions with no
   scenario, unknown element types, dropped regions, screens with no elements.
6. A reminder that the wireframes are deliberately unstyled, so "it looks plain"
   is not a finding.

## Keeping it honest

- **A sketch is inference, not specification.** If the team treats the board as
  the agreed design, the agreement still lives in the feature file. Say so.
- **`aside` renders below `main`, not beside it.** A 344px card cannot show two
  columns legibly. The regions are semantic slots, not a layout - do not use them
  to argue about placement.
- **`route` is a guess** until the app exists. It is shaped like a real route on
  purpose (see the spec contract's last section), so a later run's `flow.ndjson`
  can be compared against it - which is also why an `action` names its
  destination as a route rather than as prose.
- **An `action` is a claim about behaviour, and the board is not a flow diagram.**
  The only lines on it run from a callout to the control it annotates. If someone
  wants page-to-page arrows, the honest version is `flow-map` after a run, not a
  graph drawn from the same wording twice.
- **The callout's scenario is what makes it reviewable.** A callout citing no
  scenario, or citing one that does not say what the callout says, is worse than
  no callout: it looks sourced.
- **No screenshots, no real data.** Example values come from `Examples:` tables.
  If a value looks like a real customer's, it came from the feature file and that
  is a problem with the feature file.
- Regenerate after every change to the feature files; a stale board is worse than
  none, because it looks like agreement.
- `bdd-artifacts/` must stay git-ignored. Commit the spec JSON rather than the
  HTML when the team wants to diff how the intended UI changed across releases.
- If an `Artifact` tool is available and the user wants a link to share with
  reviewers, offer to publish the board. Do not publish without asking - a
  sketch is internal content, and an unfinished one invites being mistaken for
  a decision.

## Reference files

- `${CLAUDE_PLUGIN_ROOT}/references/sketch-spec.md` - the exact JSON contract the renderer consumes
- `${CLAUDE_PLUGIN_ROOT}/references/wireframe-vocabulary.md` - element types, the step-wording-to-element rules, and the do-nots
