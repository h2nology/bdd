# API-layer Gherkin: what carries a contract

A scenario yields an operation only when it names one. This file describes what
`openapi.cjs extract` recognises, and how to write scenarios that carry a
contract without decaying into HTTP scripts.

## What the extractor recognises

### Method and path

Any step whose text contains an HTTP verb followed by a path. All of these work:

```gherkin
When I POST /api/v1/orders
When I send a POST request to "/api/v1/orders"
When the client sends POST "/orders" with the payload below
Given a GET /orders/{id} request
```

The verb must be one of `GET POST PUT PATCH DELETE HEAD OPTIONS`, uppercase or
not. The path must start with `/`. Everything after the first whitespace, quote,
comma or closing paren ends the path, and a `?query` or `#fragment` is dropped.

**Path templating.** `/orders/1234` becomes `/orders/{id}`, a UUID segment
becomes `{uuid}`, a long hex segment becomes `{hash}`. Segments already written
as `{id}` are left alone. Pass `--keep-ids` when the specific record matters
(rare - usually it means the scenario is over-specified).

**Base paths.** If the scenarios say `/api/v1/orders` and the spec says
`/orders`, pass `--base-path /api/v1` so both sides match. The prefix is
stripped from the scenario side *and* the spec side, so it is safe either way.

### Status codes

```gherkin
Then the response status is 201
Then the response status code should be 422
Then the API responds with 404
Then the response code is 200
```

A bare number is never read as a status: the text must carry `status`, `status
code`, `response code`, or `responds with`. That is deliberate - `Then the order
total is 42.50` must not become a `42` response.

### Payloads

Two sources, both attached to the operation named most recently before them:

**Doc strings containing JSON** - the strongest signal, because JSON gives types:

```gherkin
When I POST /orders with:
  """
  {"sku": "ESP-100", "quantity": 2}
  """
```

**Data tables** - the header row names the fields, the body rows give sample
values; numeric-looking cells are read as numbers.

### Request or response?

The step's effective keyword decides. `Given` and `When` describe what is sent;
`Then` describes what comes back. `And` and `But` inherit whatever came before
them, which is what makes this read correctly:

```gherkin
When I POST /orders with:          # request
  """
  {"sku": "ESP-100"}
  """
Then the response status is 201
And the response body is:          # response, because And follows Then
  """
  {"id": "8f14e45f-ceea-467a-9f2e-1b0a4c2d3e4f", "status": "confirmed"}
  """
```

A payload in a step that also states a status code is always treated as a
response, whatever its keyword.

### Type inference from examples

| Example value | Inferred |
|---|---|
| `"ESP-100"` | `string` |
| `2` | `integer` |
| `12.50` | `number` |
| `true` | `boolean` |
| `"2026-01-15T10:30:00Z"` | `string` / `date-time` |
| `"2026-01-15"` | `string` / `date` |
| `"a@b.com"` | `string` / `email` |
| `"8f14e45f-ceea-467a-9f2e-1b0a4c2d3e4f"` | `string` / `uuid` |

Two adjustments worth knowing:

- **`required` narrows to the intersection.** A field present in every example
  is required; a field present in only some is optional. This is usually right
  and occasionally too generous - two examples is thin evidence.
- **Money is forced to `number`.** JSON cannot distinguish `25.00` from `25`, so
  a field whose name looks monetary (`price`, `total`, `amount`, `discount`,
  `tax`, `fee`, `balance`, `refund`, `charge`, `cost`, `subtotal`) is never
  typed `integer` even when its example is round. Typing money as an integer
  silently drops the cents downstream.

### Scenario Outlines

Expanded first, so every example row contributes. An outline with
`When I GET /orders/<id>` over rows `1234` and `9999` yields one operation
(`GET /orders/{id}`) with both status codes attached.

## Writing scenarios that carry a contract

The tension is real: this plugin's `discover` skill tells you to keep HTTP out
of scenarios about business behaviour, and it is right. The resolution is not to
compromise both - it is to know which kind of scenario you are writing.

**Contract scenarios** belong in their own feature file, tagged `@api`. Their
subject genuinely *is* the HTTP interface - that is what they verify, and that
is who reads them:

```gherkin
@api @REQ-2001
Scenario: Rejecting an order for an out-of-stock item
  When I POST /orders with:
    """
    {"sku": "GONE-1", "quantity": 1}
    """
  Then the response status is 422
  And the response body is:
    """
    {"error": "out_of_stock", "sku": "GONE-1"}
    """
```

**Business scenarios** stay declarative and say nothing about HTTP. They are not
deficient; they are about something else.

What to avoid in both: a scenario that asserts on status codes *while claiming
to be about business behaviour*. `Then the response status is 200` as the only
assertion in a checkout scenario verifies that the server answered, not that the
shopper was charged correctly.

## Limits

- A path stated once is one example of a path. The extractor reports what it
  saw; it never extrapolates the rest of the resource model.
- Headers, auth schemes, query parameters and content types are not extracted.
  Query strings are stripped from paths on purpose - `?page=2` is a parameter,
  not a different operation.
- An operation mentioned with no status code and no payload is marked
  `INFERRED`: the scenario named a path but stated nothing verifiable about it.
- Response schemas are keyed by status code. When a scenario gives a payload but
  no status, it is filed under the most recent status seen in that scenario, or
  `200`.
