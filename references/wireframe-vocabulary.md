# Wireframe vocabulary and derivation rules

Two jobs: the element vocabulary the renderer can draw, and the rules that turn
Gherkin wording into those elements. Follow the rules rather than improvising, so
the same feature file yields the same sketch twice.

## 1. Element types

| `type` | Drawn as | Use when |
|---|---|---|
| `heading` | Bold text, large | A screen's or section's title |
| `text` | Grey text line | Static copy, an instruction, a total |
| `input` | Labelled box | A single-line value the user types |
| `textarea` | Labelled tall box | Free text (a comment, an address) |
| `select` | Labelled box with a caret | One choice from a known set |
| `radio` | Circles + labels | One choice, all options visible |
| `checkbox` | Squares + labels | Zero-or-more choices, or a single opt-in |
| `date` | Labelled box with a calendar glyph | A date or date range |
| `file` | Box with an upload glyph | An attachment or import |
| `search` | Box with a magnifier | A query field whose result is a list below |
| `button` | Filled (primary) or outlined pill | Anything the user clicks to act |
| `link` | Underlined text | Navigation that is not the screen's main action |
| `table` | Header row + skeleton rows | Tabular records; put the real headers in `columns` |
| `list` | Stacked rows | Repeated items that are not columnar |
| `card` | Bordered box with a label | A grouped summary (an order total, a product) |
| `image` | Box with a diagonal cross | A photo, a logo, a map |
| `chart` | Box with bars | A metric visualisation |
| `badge` | Small pill | A status on a record (`Paid`, `Pending`) |
| `alert` | Tinted bar | A message the screen shows; use `emphasis` for its severity |
| `nav` | Horizontal row of labels | Top-level navigation; `items` are the destinations |
| `tabs` | Underlined row of labels | In-screen switching; `current` marks the active one |
| `stepper` | Numbered chain | A multi-screen process indicator (checkout step 2 of 3) |
| `pagination` | Page-number row | A long list's paging control |
| `empty` | Dashed box with the label | The explicit empty state a scenario describes |
| `spinner` | Circle glyph | A loading state a scenario waits on |
| `divider` | Horizontal rule | A visual break; no label |

Anything else renders as a dashed placeholder carrying the raw type name, and
the renderer reports it. That is a signal to pick a real type, not a feature.

## 2. Gherkin wording to elements

Read the steps as evidence. Each row is a licence to draw something - the left
column is what must actually be in the feature text.

| Step wording | Element(s) to place |
|---|---|
| "I am on the X page", "I open X" | Establishes screen X. Not an element |
| "I enter / fill in / type <label>" | `input` on that screen, `label` = the field named |
| "I enter my password" | `input` with `label` "Password" and `value` masked as `••••••••` |
| "I select <v> from <label>" | `select` with `label` = the control, `value` = v, `items` = every value the scenario set uses |
| "I choose <v>" (small fixed set) | `radio` with `items` |
| "I check / tick <label>" | `checkbox` |
| "I upload <file>" | `file` |
| "I search for <q>" | `search` with `value` = q, plus a `table` or `list` below it |
| "I click / press / tap <label>" | `button` with that label. The scenario's decisive action is `emphasis: "primary"`; everything else `secondary`; a destructive one `danger` |
| "I follow / go to <label>" | `link` |
| "I should see the message <m>" | `alert` with `label` = m, `emphasis` `danger` for an error, `primary` for a confirmation |
| "I should see <n> results / a list of X" | `table` (name the `columns` from whatever attributes the steps mention) or `list` |
| "I should see no results", "the cart is empty" | `empty` with the wording the step uses |
| "I should see <field> is <value>" | `text` (read-only display), not an `input` |
| "the status is <s>" | `badge` with `label` = s |
| "I should be on step N of M" | `stepper` on that screen with `current` = N-1 |
| A `Examples:` table column | Its header names a field; its first row supplies each element's `value` |
| Two `Given`s setting different data on one page | Two cards sharing a `route`, with distinct `state` values |
| A `Then` describing a different rendering of the same page | A `state` variant of that page, not a new page |
| A `Background:` step | Applies to every screen the feature's scenarios establish - typically `nav`, a logged-in user chip, a `Background`-set list |

Fill `step` on every element derived this way. An element with no `step` and no
entry in `notes` is a design guess; either justify it or drop it.

## 3. Deriving the screens and transitions

1. **Collect the screens.** One screen per distinct place the steps put the user.
   Evidence for a screen is an explicit navigation step ("I am on the checkout
   page"), a step that only makes sense elsewhere ("I should see the order
   confirmation number"), or a `Then` that describes a different context from its
   `When`. Do not create a screen per scenario: several scenarios usually
   describe the *same* page, and rule 3 covers the states they differ in.
2. **Give each a `route`.** Web: derive a plausible path from the screen's name
   and any resource id in the steps (`/orders/:id`). Mobile: an `…Activity` /
   `…ViewController`-shaped name. Keep it route-shaped (see the spec contract's
   last section).
3. **Split by data state, not by scenario.** When two scenarios show the same
   page holding different data, draw **one card per state**, sharing a `route`
   and `name` with distinct `state` values (see the spec contract's "State
   variants"). "Given my cart contains 2 items" and "Given my cart is empty" are
   two cards, because they look different, and because they usually lead
   somewhere different. What is *not* a new card: two scenarios reaching the same
   page in the same data state, differing only in wording.
4. **Draw the transitions from the steps that move the user.** The `When` that
   ends a screen's involvement is the `trigger`. A failure scenario's stop is
   `kind: "error"`. Only draw an edge the feature text supports. Point each edge
   at the **specific variant** it reaches - a declined card lands on the declined
   variant, not on "Payment" in general.
5. **Anchor each transition to its control.** Carry the triggering step verbatim
   into both the button's `step` and the transition's `trigger`, and the arrow
   starts at that button instead of at the card's edge. Add an element `id` plus
   `fromElement` only when one screen has two controls with the same step text.
6. **Mark the entries.** Any screen a scenario's first navigation step lands on
   gets `entry: true`.
7. **Write down what is missing.** Every place you wanted to draw an edge or a
   field but the text did not say - `openQuestions`. This list is the most
   valuable part of the artefact, because it is the list of conversations the
   feature file still owes the team.

## 4. Do not

- **Do not invent screens the feature does not imply.** No "Settings" screen
  because apps usually have one. The sketch's authority comes from being derived,
  not from being complete.
- **Do not style.** No colours, no brand, no spacing choices. This is a
  greyscale wireframe whose job is to provoke "that's not what I meant" early -
  polish invites the opposite reaction.
- **Do not paraphrase step text in `step` or `trigger`.** Carry it verbatim, so a
  reviewer can grep the feature file for it.
- **Do not fabricate example data.** Use the `Examples:` table's values, or a
  visibly synthetic placeholder. A wireframe with plausible-looking invented
  customer data gets mistaken for a real record.
- **Do not resolve an ambiguity silently.** That is what `openQuestions` is for.
- **Do not invent a state variant.** A loading, permission-denied or error state
  no scenario describes is an open question, not a card. Draw the states the
  feature earns, then say which ones it never mentions.
