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
| `screens` | **yes** | At least one. Order only decides which column a page lands in; the board is a grid of pages, not a flow |
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
| `id` | **yes** | Stable slug, unique. Keep it stable across regenerations so a reviewer's mental map survives |
| `name` | **yes** | Shown on the card header |
| `route` | no | Web: the inferred path (`/checkout/payment`). Mobile: the screen name (`PaymentActivity`). **Keep it shaped like a real route** - this is what lets a later run's `flow.ndjson` be matched against the sketch, and it is what groups a page's state variants (see below) |
| `state` | no | Which data state this card shows: `"empty"`, `"card declined"`, `"2 items"`. Omit for a page with only one state. See "State variants" |
| `purpose` | no | One line, in the user's language. Why the screen exists |
| `entry` | no | `true` when a scenario starts here. Entry cards get a thicker border and are placed first |
| `tags` | no | Gherkin tags carried through, so `@REQ-…` traceability survives into the sketch |
| `source` | no | Where in the feature files this screen was inferred from. Shown in the detail panel |
| `regions` | **yes** | At least one non-empty region |
| `notes` | no | Behaviour the wireframe cannot show |

`regions` keys are fixed: `header`, `main`, `aside`, `footer`. Unknown keys are
ignored (and reported as a warning). `aside` is dropped on a `mobile` viewport.

## Element

```json
{
  "type": "input",
  "label": "Card number",
  "value": "4111 1111 1111 1111",
  "hint": "16 digits, no spaces",
  "required": true,
  "width": "full",
  "emphasis": "primary",
  "items": ["Visa", "Mastercard"],
  "columns": ["Item", "Qty", "Price"],
  "step": "When I enter my card number",
  "action": {
    "text": "on success opens /checkout/done; a declined card stays here with an error alert",
    "scenario": "Paying with a declined card",
    "source": { "uri": "features/checkout.feature", "line": 14 }
  }
}
```

| Field | Applies to | Notes |
|---|---|---|
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
| `action` | button, link (any type may carry one) | What happens after the click, and which scenario says so. `{ text, scenario, source? }`. **Required on every `button` and `link`** - the renderer reports one that has none, and one whose `scenario` is missing. See "Click behaviour" |

## Click behaviour

There are **no flow arrows on this board**, and nothing about behaviour is
written on the wireframe itself. What happens after a click goes in a **callout
beside the page**, joined to its control by a leader line, and it carries the
scenario it came from:

```json
{ "type": "button", "label": "Pay now", "emphasis": "primary",
  "step": "When I submit payment",
  "action": {
    "text": "on success opens /checkout/done; a declined card stays here with an error alert",
    "scenario": "Paying with a declined card",
    "source": { "uri": "features/checkout.feature", "line": 14 }
  } }
```

| Field | Required | Notes |
|---|---|---|
| `text` | **yes** | What happens after the click, in one or two short sentences. An `action` with no `text` is dropped |
| `scenario` | **yes in practice** | The `Scenario:` name, **verbatim**, that this behaviour comes from. The renderer reports an action without one, because a claim on the board with no provenance is exactly what a reviewer cannot check |
| `source` | no | `{ uri, line }` of that scenario, shown as `feature:line` in the callout's footer |

Why a callout rather than an arrow or a caption on the button:

- **An arrow only says which card comes next**, which is the easy half. What has
  to be true for it to go there, and what happens when it does not, only fits in
  words.
- **Words on the wireframe stop it being a wireframe.** The card is what the
  reviewer compares against their mental picture of the screen; behaviour is a
  claim *about* the card, so it sits outside it with a line pointing in.
- **The scenario name is the reason to trust it.** It turns "the button does X"
  into "this scenario says the button does X", which is checkable.

Rules:

- **Every `button` and every `link` carries an `action`.** A control with none is
  reported as a warning, because a button whose outcome nobody wrote down is the
  gap this board exists to surface. If the feature genuinely does not say, put
  that in `openQuestions` and say so in the `text`
  (`"unspecified - see open questions"`).
- **Name the destination the way `route` names it** (`"opens /checkout/payment"`,
  `"back to /products"`), so the intended destination is still greppable against
  a later run's `flow.ndjson`.
- **Say the condition when there is one**, and both outcomes when a step has two
  (`"on success … ; when declined …"`). This is where an error path lives now.
- **Carry `scenario` verbatim** from the feature file, so a reviewer can grep for
  it. When one control's behaviour is established by two scenarios, either name
  the one that decides the outcome or write two sentences in one `text` - the
  board draws one callout per control, not per scenario.
- **Keep it to a couple of sentences.** A callout clamps a long `text` (the full
  string stays in the tooltip and the detail panel). Behaviour that needs a
  paragraph is a screen `note`, not an `action`.
- Reproduce the outcome as the feature words it. An `action` is still an
  inference - it does not license inventing a destination no scenario mentions.

Any element type may carry an `action` (a `list` whose rows open a detail page,
for instance). Only `button` and `link` are required to.

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
states usually behave differently when the same button is clicked.

Rules:

- Give every variant of a page the **same `route` and `name`**, and a distinct
  `state`. The `state` text is what the reviewer reads on the card header, so
  name the *data condition* (`"empty"`, `"card declined"`, `"read-only"`), not
  the visual (`"variant B"`).
- Give each variant its own `id`, and name the specific variant in the `action`
  text that leads to it: a declined payment names the declined state, not
  "Payment".
- Only create a variant a scenario actually describes. A state you merely suspect
  exists (a loading state, a permissions state) goes in `openQuestions`, not on
  the board.
- Do **not** split on cosmetic difference. Two scenarios that reach the same page
  in the same data state, differing only in wording, are one card.

## Open questions

A Gherkin feature almost never fully determines a UI. When deriving the sketch
leaves a real gap - an unspecified error destination, a screen the scenarios
imply but never describe, a field whose type is a guess - put it in
`openQuestions` instead of inventing a confident answer. The renderer draws them
in a panel on the canvas, so the review conversation happens over the gaps
rather than over a wireframe that hides them.

## Alignment with the flow capture contract

`route` is deliberately the same shape as the `url` path / `screen` name in
`skills/flow-map/references/capture-contract.md`. The sketch says which pages are
*intended* and what each control claims to do; `flow.ndjson` records what a run
*observed*. Keeping the node identity in the same shape is what lets the two be
compared later - do not "improve" `route` into a prose label, and name
destinations inside `action` the same way.
