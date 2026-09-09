---
name: sketch
description: This skill should be used when finished Gherkin features must be turned into a UI sketch before any code is written - for example "sketch the UI from these features", "what would this feature look like", "show me the screens this feature implies", "draw wireframes from the feature file", "derive the UX from the Gherkin", "make a Figma-like board for this feature", "I want to see the page flow before we build it", or when a stakeholder wants to review a feature visually rather than as text. Produces a read-only pan/zoom wireframe canvas showing every data state of each page, with transition arrows drawn from the button or link that triggers them. For the flow the tests *actually* covered after a run, use the flow-map skill instead.
---

# UI sketch from Gherkin

Derive the screens a feature implies, their wireframes and the transitions
between them, and render them on a read-only Figma-style board.

Where this sits in the plugin:

| Skill | Question it answers | Timing |
|---|---|---|
| `discover` | What should the system do? | first |
| **`sketch`** | **What would that look like?** | **after the feature file is agreed, before code** |
| `implement` | Build it, scenario by scenario | next |
| `flow-map` | Which screens did the tests actually visit? | after a run |

`sketch` and `flow-map` both draw a transition diagram, and they are not the
same artefact: this one is the **intended** flow inferred from the text, that one
is the **observed** flow recorded from a real run. Never present a sketch as
evidence of what the app does.

## What it is for

A feature file is agreed in words and then implemented into something nobody
pictured the same way. This board makes the disagreement surface in minutes, at
the point where it is still free to fix - and it does so **without becoming a
design**: greyscale wireframes, no brand, no polish, so the reviewer argues about
the content rather than the colours.

The single most valuable part of the output is `openQuestions`: the list of
things the feature file does not determine. Do not resolve those silently.

## Communication policy

- The spec JSON, element labels, `route` values and `step`/`trigger` text stay in
  **English** when the feature file is English - carry step text **verbatim** so a
  reviewer can grep for it.
- Explain the board and the open questions to the user in **their** language, and
  localize the board chrome with `--labels`.

## 1. Read the features

Read every feature file in scope before writing anything:

```bash
ls features/**/*.feature
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs --input features --json bdd-artifacts/spec.json
```

The `--json` model gives the parsed scenarios, tags and `Examples:` tables, which
is what the derivation needs. Reading the raw `.feature` text alongside it is
still worth it: wording matters, and the derivation rules key off it.

Sketch one coherent slice at a time - a feature, or a `Rule` - not a whole suite.
A board with forty screens is not reviewable.

## 2. Derive the spec

Follow `references/wireframe-vocabulary.md`, which has the element vocabulary,
the step-wording-to-element rules, and the do-nots. Write the result to
`bdd-artifacts/sketch.json` in the format specified by
`references/sketch-spec.md`.

The two contracts exist so the split holds:

- **You decide what is on a screen.** Gherkin says "submits payment", not "there
  is a card-number field"; that inference is a judgement call and it is yours.
- **The renderer decides where it goes.** Never write pixel coordinates - layout
  comes from `region` + array order + `width`, so regenerating the spec cannot
  make the board drift.

Three rules worth repeating because they are what makes the artefact trustworthy:

- Fill `step` on every element and `trigger` on every transition, verbatim from
  the feature. An element with no `step` and no `notes` entry is a design guess.
  Matching text also anchors each arrow to its button for free (below).
- **One card per data state.** A page whose UI depends on data is several cards
  sharing a `route`, each with its own `state` - "empty", "card declined", "2
  items". They are drawn stacked inside one labelled group. Collapsing them into
  a single card hides the difference the reviewer is there to check, and gets the
  flow wrong, because the states usually lead somewhere different.
- Every gap goes in `openQuestions`, not into a confident invention. A state you
  suspect exists but no scenario describes is a question, not a card.

## 3. Render the board

Two equivalent entry points. Call the script directly:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sketch.cjs \
  --input bdd-artifacts/sketch.json \
  --out bdd-artifacts/sketch.html \
  --json bdd-artifacts/sketch-layout.json \
  --mermaid bdd-artifacts/sketch.mmd \
  --labels zh-CN
```

| Option | Effect |
|---|---|
| `--input <file>` | Sketch spec JSON (default `bdd-artifacts/sketch.json`) |
| `--out <file>` | Output HTML (default `bdd-artifacts/sketch.html`) |
| `--json <file>` | The laid-out model: each screen's box, column, row, plus warnings |
| `--mermaid <file>` | The screen flow as Mermaid source, for a PR or a wiki |
| `--labels <tag>` | Board chrome language: `en` \| `zh-CN` \| `zh-TW` \| `ja` |
| `--title <text>` | Override the board title |
| `--viewport <v>` | Override `app.viewport`: `desktop` \| `tablet` \| `mobile` |

…or go through the `html-report` skill with `mode=sketch`, which shells out to this
same script — use that when the request is phrased as rendering a report, or when a
board is produced alongside other bdd artefacts. It maps `lang` onto `--labels` and
`output_path` onto `--out`, and ignores `theme`. Either way the renderer is this
script, so there is only one set of layout rules to keep straight. Note that
`html-report` accepts `ko` and the board does not (`en` \| `zh-CN` \| `zh-TW` \| `ja`);
a `ko` request falls back to English chrome, so say so rather than letting the
reviewer wonder.

Exit codes: `0` board written, `2` the spec is missing, unparseable, has no
screens, or has a transition pointing at a screen id or a `fromElement` that does
not exist. A dangling reference is deliberately fatal rather than silently
dropped - a flow diagram missing an edge is worse than no diagram.

### How the board is laid out

Positions are computed twice. `sketch.cjs` writes a simple column layout into the
HTML, and the page then loads **elkjs** from a CDN and re-runs the layout with
orthogonal edge routing, so no arrow crosses a card. Consequences worth knowing:

- **It needs network on first open.** Without it the board still works - it keeps
  the built-in layout and says so in the toolbar - but arrows are drawn as curves
  that may pass over a card. Tell the user this if they are reviewing offline.
- Groups of state variants move as one unit and their frame is drawn around them,
  so a page's states always read as a column.
- Groups holding an entry screen are pinned to the first layer, so the board
  reads left-to-right from where a journey starts.

### What reviewers can do

The board is **read-only** on purpose. It is a review artefact; the way to change
what it shows is to change the feature file and regenerate. Reviewers can:

- drag to pan, `⌘`/`ctrl` + wheel (or pinch) to zoom, `+` / `-` / `0` by keyboard
- click a screen to highlight everything that reaches it or leads out of it, and
  see its state, purpose, source `feature:line`, tags and the steps it was
  derived from
- jump between a page's states from the detail panel
- follow each arrow back to the control that triggers it - arrows leave from the
  button or link named by the step, not from the card's edge
- press `Esc` or click the same screen again to clear the selection

## 4. Read the board before showing it

| Observation | What it usually means |
|---|---|
| A screen with no outgoing transition | A dead end. Either a journey is unfinished, or the feature never says where the user goes next |
| A page with only one state | Ask whether it really has one. Empty, error and loading states are the ones features forget |
| Two variants with identical wireframes | Over-splitting: they are the same state described twice. Merge them |
| A variant nothing leads to | The feature describes the state but never how the user reaches it |
| An arrow leaving from a card's edge, not a control | No element carries that step text. Either the button is missing from the sketch, or the step never says what the user clicks |
| A screen whose elements have no `step` | Invention. Justify each one from the text or drop it |
| Many `openQuestions` on one screen | That screen's scenarios are underspecified - the most useful thing you can report |
| An `error` transition with no destination screen | The failure path was written as an outcome but never as a place |
| A screen drawn as an entry that should not be one | The spec is missing the transition that reaches it; the renderer warns about exactly this |
| A wireframe that looks obviously wrong | Good - that is the artefact working. Take it back to the feature file |

## 5. Reporting

Give the user:

1. Counts: pages, state variants, transitions, elements, open questions - and
   that this is derived from the text, not observed from a run.
2. Which pages have more than one state, and which have only one - the latter is
   usually where a state is missing rather than where none exists.
3. The board path, and that the `.mmd` renders as a diagram in a PR or wiki.
4. **The open questions, spelled out.** Do not bury them - they are the reason to
   sketch before building. Ask which ones they want to answer into the feature
   file now.
5. Any renderer warnings: unknown element types, dropped regions, duplicate
   element ids, screens with no incoming transition.
6. A reminder that the wireframes are deliberately unstyled, so "it looks plain"
   is not a finding.

## 6. Limits worth stating out loud

- **A sketch is inference, not specification.** If the team treats the board as
  the agreed design, the agreement still lives in the feature file. Say so.
- **The final layout needs elkjs from a CDN.** Offline the board falls back to a
  simpler layout whose arrows may cross a card. The wireframes, groups, arrows
  and interactions are unaffected.
- **`aside` renders below `main`, not beside it.** A 344px card cannot show two
  columns legibly. The regions are semantic slots, not a layout - do not use them
  to argue about placement.
- **`route` is a guess** until the app exists. It is shaped like a real route on
  purpose (see the spec contract's last section), so a later run's `flow.ndjson`
  can be compared against it.
- **No screenshots, no real data.** Example values come from `Examples:` tables.
  If a value looks like a real customer's, it came from the feature file and that
  is a problem with the feature file.
- `bdd-artifacts/` must stay git-ignored; regenerate the board, do not commit it.

## Reference files

- `references/sketch-spec.md` - the exact JSON contract the renderer consumes
- `references/wireframe-vocabulary.md` - element types, the step-wording-to-element rules, and the do-nots
