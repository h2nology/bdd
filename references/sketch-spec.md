# Sketch spec contract

`sketch.cjs` consumes exactly this format. The `sketch` skill's job is to derive
it from Gherkin; the renderer's job is to draw it. Nothing in this file is
inferred by the renderer - if the model did not put it in the JSON, it does not
appear on the canvas.

Default location: `bdd-artifacts/sketch.json`.

## Why the split

The model decides *what is on a screen* (a judgement call - Gherkin says
"submits payment", not "there is a card-number field"). The renderer decides
*where it goes* (a deterministic layout). Consequently:

- **Never put pixel coordinates in this file.** Position comes from `region` +
  array order + `width`. Re-generating the JSON therefore cannot make the canvas
  drift.
- **Never put HTML in this file.** Element `type` selects the wireframe glyph.

## Top level

```json
{
  "app": {
    "name": "Checkout",
    "platform": "web",
    "viewport": "desktop"
  },
  "screens": [ /* Screen */ ],
  "transitions": [ /* Transition */ ],
  "openQuestions": [
    "Where does a declined card return the user? No scenario covers it."
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `app.name` | no | Canvas title. Defaults to the source feature's name |
| `app.platform` | no | `web` \| `mobile`. Drives the frame chrome (URL bar vs status bar) and whether nodes are called pages or screens |
| `app.viewport` | no | `desktop` \| `tablet` \| `mobile`. Card width only. Default `desktop`, or `mobile` when platform is `mobile` |
| `screens` | **yes** | At least one. Order is irrelevant; layout comes from the transition graph |
| `transitions` | no | Omit for a single-screen feature |
| `openQuestions` | no | Rendered as a visible panel. See "Open questions" below |

## Screen

```json
{
  "id": "payment",
  "name": "Payment",
  "route": "/checkout/payment",
  "state": "card declined",
  "purpose": "Collect card details and submit the charge",
  "entry": true,
  "tags": ["@REQ-1042"],
  "source": { "uri": "features/checkout.feature", "line": 12 },
  "regions": {
    "header": [ /* Element */ ],
    "main":   [ /* Element */ ],
    "aside":  [ /* Element */ ],
    "footer": [ /* Element */ ]
  },
  "notes": ["Card number is masked on blur"]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | **yes** | Stable slug, unique. `transitions` reference it. Keep it stable across regenerations so a reviewer's mental map survives |
| `name` | **yes** | Shown on the card header and in the flow diagram |
| `route` | no | Web: the inferred path (`/checkout/payment`). Mobile: the screen name (`PaymentActivity`). **Keep it shaped like a real route** - this is what lets a later run's `flow.ndjson` be matched against the sketch, and it is what groups a page's state variants (see below) |
| `state` | no | Which data state this card shows: `"empty"`, `"card declined"`, `"2 items"`. Omit for a page with only one state. See "State variants" |
| `purpose` | no | One line, in the user's language. Why the screen exists |
| `entry` | no | `true` when a scenario starts here. Entry cards get a thicker border and seed the layout's first column |
| `tags` | no | Gherkin tags carried through, so `@REQ-…` traceability survives into the sketch |
| `source` | no | Where in the feature files this screen was inferred from. Shown in the detail panel |
| `regions` | **yes** | At least one non-empty region |
| `notes` | no | Behaviour the wireframe cannot show |

`regions` keys are fixed: `header`, `main`, `aside`, `footer`. Unknown keys are
ignored (and reported as a warning). `aside` is dropped on a `mobile` viewport.

## Element

```json
{
  "id": "pay-now",
  "type": "input",
  "label": "Card number",
  "value": "4111 1111 1111 1111",
  "hint": "16 digits, no spaces",
  "required": true,
  "width": "full",
  "emphasis": "primary",
  "items": ["Visa", "Mastercard"],
  "columns": ["Item", "Qty", "Price"],
  "step": "When I enter my card number"
}
```

| Field | Applies to | Notes |
|---|---|---|
| `id` | all | Optional, unique within its screen. Only needed so a transition's `fromElement` can point at this element - see "Anchoring a transition to a control" |
| `type` | all | **Required.** See the vocabulary reference. An unknown type renders as a labelled placeholder box and is reported |
| `label` | all | The visible text. Required for everything except `divider`, `image`, `spinner` |
| `value` | inputs | Example data. Prefer values lifted verbatim from the scenario's `Examples:` table - a wireframe showing the real example data is far more reviewable than one showing "Lorem" |
| `hint` | inputs | Helper/placeholder text |
| `required` | inputs | Draws the required marker |
| `width` | all | `full` (default) \| `half` \| `third`. Consecutive non-full elements share a row |
| `emphasis` | button, badge, alert | `primary` \| `secondary` \| `danger` \| `muted` |
| `items` | list, nav, tabs, radio, checkbox, select, stepper | Option/entry labels |
| `columns` | table | Column headers. Rows are drawn as skeleton bars |
| `current` | tabs, stepper | Index (0-based) of the active item |
| `step` | all | The Gherkin step that implies this element. Shown on hover and in the detail panel. **This is the traceability link - fill it in whenever a step is what put the element on the screen** |

## Transition

```json
{
  "from": "payment",
  "fromElement": "pay-now",
  "to": "confirmation",
  "trigger": "When I submit payment with a valid card",
  "kind": "primary",
  "tags": ["@REQ-1042"],
  "source": { "uri": "features/checkout.feature", "line": 14 }
}
```

| Field | Required | Notes |
|---|---|---|
| `from`, `to` | **yes** | Screen `id`s. A dangling id is a hard error - the renderer exits `2` rather than drawing a partial graph |
| `fromElement` | no | Element `id` on the `from` screen that this transition leaves from, so the arrow starts at the button or link the user clicks rather than at the card's edge. A dangling element id is a hard error too. When omitted the renderer falls back to matching `trigger` against each element's `step` - see below |
| `trigger` | no | The Gherkin step that causes it. Becomes the edge label |
| `kind` | no | `primary` (default, solid) \| `alternate` (thin) \| `error` (dashed red). `error` is for failure paths - a declined card, a validation stop |
| `tags`, `source` | no | As for a screen |

`from === to` is allowed (a screen that re-renders itself) and drawn as a self-loop.

## State variants

**One card per data state, not one card per page.** A page whose UI differs by
data is several cards that share a `route`:

```json
{ "id": "cart-filled", "name": "Cart", "route": "/cart", "state": "2 items",  "entry": true,  "regions": { … } },
{ "id": "cart-empty",  "name": "Cart", "route": "/cart", "state": "empty",    "entry": true,  "regions": { … } }
```

Screens sharing a `route` are laid out inside one labelled group box, so the
board reads as "this page, in these states".

Why this way round: a Gherkin scenario *is* a data state - "Given my cart
contains 2 items" and "Given my cart is empty" describe the same page twice.
Collapsing them into one card with two `alert` elements throws away exactly the
thing the reviewer needs to see, and it makes the flow wrong too, because the two
states usually have different outgoing transitions.

Rules:

- Give every variant of a page the **same `route` and `name`**, and a distinct
  `state`. The `state` text is what the reviewer reads on the card header, so
  name the *data condition* (`"empty"`, `"card declined"`, `"read-only"`), not
  the visual (`"variant B"`).
- Give each variant its own `id`, and point transitions at the specific variant:
  a declined payment goes to the declined variant, not to "Payment".
- Only create a variant a scenario actually describes. A state you merely suspect
  exists (a loading state, a permissions state) goes in `openQuestions`, not on
  the board.
- Do **not** split on cosmetic difference. Two scenarios that reach the same page
  in the same data state, differing only in wording, are one card.

## Anchoring a transition to a control

An arrow that starts at the button the user clicks is far easier to review than
one that starts at a card's edge. The renderer resolves the anchor in this order:

1. `fromElement`, when given - an element `id` on the `from` screen.
2. Otherwise, the element whose `step` equals the transition's `trigger`,
   preferring a `button` or `link` over other types.
3. Otherwise, the card's edge.

So filling in `step` on your buttons and `trigger` on your transitions - both
verbatim from the feature file - gets the arrows anchored for free. Reach for
`fromElement` only when a screen has two controls carrying the same step text.

## Open questions

A Gherkin feature almost never fully determines a UI. When deriving the sketch
leaves a real gap - an unspecified error destination, a screen the scenarios
imply but never describe, a field whose type is a guess - put it in
`openQuestions` instead of inventing a confident answer. The renderer draws them
in a panel on the canvas, so the review conversation happens over the gaps
rather than over a wireframe that hides them.

## Alignment with the flow capture contract

`route` is deliberately the same shape as the `url` path / `screen` name in
`skills/flow-map/references/capture-contract.md`. The sketch is the *intended*
flow; `flow.ndjson` is the *observed* flow. Keeping the node identity in the same
shape is what would let the two be diffed later - do not "improve" `route` into
a prose label.
