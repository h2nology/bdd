# Proposing an API from business-language scenarios

When the scenarios state no HTTP facts, an OpenAPI document is a **design
proposal**, not an extraction. This file is how to make that honest and useful
instead of confident and wrong.

The failure to avoid: producing a polished `openapi.yaml`, handing it over as
"generated from your feature files", and letting the reader believe the paths
came from the specs. They came from you. Say so, per line.

## The proposal comes before the YAML

Present this table and get corrections first. It is cheap to argue with a table
and expensive to argue with 400 lines of YAML that someone has already skimmed
and mentally approved.

| Operation | Purpose | Source | Confidence |
|---|---|---|---|
| `POST /carts/{id}/discounts` | apply a discount code | `discount.feature:8` "I apply the discount code" | inferred |
| `422` + `{"error":"code_expired"}` | reject an expired code | `discount.feature:16` "This code has expired" | derived |
| `GET /carts/{id}` | read the cart with its totals | `checkout.feature:12` asserts a cart total | inferred |
| `DELETE /carts/{id}/discounts` | remove an applied code | nothing in the specs | assumed |
| bearer token auth | — | nothing in the specs | assumed |

## The three confidence levels

Use them consistently; they are the same three the `ddl` skill uses, and they
mean the same things.

**derived** - the scenario states it. An explicit status code, an endpoint named
in a step, an error identifier quoted in an assertion. If challenged, you can
point at a line.

**inferred** - the *behaviour* is specified and the HTTP shape is your reading
of it. "I apply the discount code" clearly implies an operation that applies a
discount code; that it is `POST /carts/{id}/discounts` rather than
`PUT /carts/{id}` with a body field is your design choice. Defensible, not
stated.

**assumed** - the specs are silent and you filled it in from ordinary REST
practice. Every one of these must be listed, because each is a decision the team
never made.

The test for the boundary between *inferred* and *assumed*: could a competent
engineer reading the same scenarios have drawn something materially different?
If yes, it is at most `inferred`; and if the scenarios never raised the question
at all, it is `assumed`.

## Reading behaviour into HTTP

Useful heuristics, not rules. State which one you applied when it is not obvious.

| In the scenarios | Usually suggests |
|---|---|
| A verb acting on one noun ("apply a discount code") | a sub-resource operation on that noun |
| "I see the list of ..." | `GET` on a collection, and a pagination question |
| "I cannot ... because ..." | a `4xx` with a machine-readable error identifier |
| A named error message | a distinct error code, not a generic 400 |
| "signed in as ..." in the Background | an auth scheme the specs never name - `assumed` |
| A state word (`pending`, `confirmed`) | an enum on the resource, and possibly a transition endpoint |
| Two scenarios differing only in role | authorization, not a separate endpoint |

Resist one-to-one translation. Five scenarios about the cart do not mean five
endpoints; they usually mean one or two resources exercised five ways.

## Questions to ask before writing YAML

These change the document, so they are worth interrupting for. Ask them in one
batch, in the user's language:

1. **Authentication** - what scheme, and does it differ per endpoint?
2. **Error body** - is there a house format (`{"error": ..., "message": ...}`,
   RFC 7807 `application/problem+json`, something else)?
3. **Collections** - paginated? What style (cursor, page/size), and what is the
   envelope?
4. **Versioning** - path prefix, header, or none?
5. **Idempotency** - do the write endpoints accept an idempotency key? This
   matters for anything that moves money.
6. **Audience** - public, partner, or internal? It changes how much the document
   must specify and how freely it can change later.

Proceed with stated assumptions for anything left unanswered - but say which
questions went unanswered at the *top* of what you hand back, not at the end.

## What not to invent

- **Endpoints nobody asked for.** A full CRUD quintet where the scenarios
  describe two operations is padding, and padding in a contract becomes work for
  someone.
- **Field names the specs never used.** If the scenario says "discount amount",
  the field is `discountAmount` or `discount_amount` following the project's
  convention - not `promoValue`.
- **Enums narrower than the evidence.** Three status words in the scenarios do
  not mean the domain has exactly three; mark the enum as inferred from the
  observed values.
- **Success-only designs.** The scenarios describe failures and those are the
  valuable part - every `4xx` a scenario implies belongs in the proposal.

## Handing it over

Along with the spec, report: how many operations were derived versus inferred
versus assumed, which questions are unanswered, and what a reviewer should check
first. A one-line version worth saying out loud:

> Of 9 operations, 2 are stated by the scenarios, 5 are my reading of specified
> behaviour, and 2 plus the auth scheme are assumptions the specs say nothing
> about. Start your review with the assumptions.
