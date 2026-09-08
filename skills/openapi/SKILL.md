---
name: openapi
description: This skill should be used when an HTTP API contract must be derived from Gherkin, or when the BDD suite must be checked against an existing one - for example "generate an OpenAPI spec from the feature files", "export our scenarios to swagger", "what API do these acceptance criteria imply", "which endpoints have no scenario covering them", "check our API tests against openapi.yaml", "document the REST API from our cucumber tests", or when someone wants a machine-readable contract out of the behaviour the suite already specifies. Emits OpenAPI 3.1 (or matches the project's existing document) and reports operation coverage both ways.
---

# Gherkin and OpenAPI

Two directions, one extractor:

| Direction | Question it answers | Output |
|---|---|---|
| **extract / generate** | What HTTP contract do these scenarios state or imply? | `openapi.yaml` (new, or merged into the existing one) |
| **coverage** | Which documented operations does no scenario touch? | `bdd-artifacts/openapi-coverage.html` |

Gherkin describes **behaviour**. Whether it also describes HTTP depends entirely
on how the team writes it, and that difference decides everything this skill
does - so establish it first, before promising the user a spec.

## Communication policy

- The spec, paths, schema names, `summary` / `description` text and any
  generated code in **English** - even when the feature files are not. An API
  contract is read by callers outside the team, often outside the company, and
  a path or schema name is an identifier before it is prose. Say this if the
  user expects the spec to match their localized scenarios.
- Discuss the design, its inferences and its open questions with the user in
  **their** language; localize the coverage report with `--labels`.

## Workflow

### 1. Look at what the scenarios actually state

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/openapi.cjs extract features/ \
  --json bdd-artifacts/openapi-extract.json --base-path /api/v1
```

This never guesses. It reports two groups, and which one dominates decides your
next step:

- **operations stated outright** - a scenario named a method and a path. Marked
  `DERIVED` when a status code or a payload backs it up, `INFERRED` when the
  path is merely mentioned.
- **`business-only` scenarios** - no HTTP facts at all. `When I apply the
  discount code "WELCOME10"` names no endpoint, and no amount of parsing will
  find one.

Read `references/api-layer-gherkin.md` for what the extractor recognises and how
request and response payloads are told apart.

### 2. Find the project's existing contract

Never emit a fresh spec next to one that already exists:

```bash
ls openapi.yaml openapi.json swagger.yaml api/openapi.yaml docs/api 2>/dev/null
find . -name 'openapi*.y*ml' -o -name 'swagger*.json' -not -path '*/node_modules/*' | head
grep -rl "openapi:\s*3\." --include='*.yaml' --include='*.yml' . 2>/dev/null | head
```

Match what you find: its OpenAPI version, YAML vs JSON, how it names schemas
(`Order` vs `OrderResponse`), whether it uses `components/schemas` and `$ref`.
Only when there is nothing to match, default to **3.1 in YAML**. Say which case
applied - "extending your existing 3.0.3 document" and "starting a new 3.1
document" lead to very different reviews.

Also look for the API's own source of truth - a router file, framework
annotations, a `@RestController`, a FastAPI app. If one exists it outranks every
inference in step 3: take paths, methods and status codes from the code, and use
the scenarios for what the code cannot tell you - which failure branches matter
and why each one exists.

### 3a. When the scenarios state HTTP facts: assemble the spec

The extractor already did the deterministic part - paths, methods, status codes,
and JSON Schema inferred from the example payloads (including `format` for
dates, uuids and emails, and `required` narrowed to fields present in *every*
example). Your job is the part that needs judgement:

- **Name things.** `/orders` + `POST` 201 body becomes `Order`, not
  `Orders_Post_201_Response`. Follow the existing document's naming if there is one.
- **Group into tags** by resource, not by feature file.
- **Write `summary` from the scenario name** and `description` from the rule it
  sits under; that is the sentence a reader needs, and it is already written.
- **Promote repeated schemas into `components/schemas`** and `$ref` them.
- **Carry the requirement tags through** as an `x-requirements` extension or in
  the description, so the contract stays traceable back to the backlog the way
  the rest of this plugin's reports are.

An inferred schema is evidence-shaped, not design-shaped: it describes the two
or three examples the scenarios happened to use. Say so, and flag fields whose
type rests on a single example.

### 3b. When the scenarios are business-only: propose, do not fabricate

This is the normal case for a well-written suite - the `discover` skill actively
discourages HTTP detail in scenarios about business behaviour, so a good feature
file is a poor API source. Do not silently invent a REST design and present it
as "derived from your specs".

Instead follow `references/design-proposal.md`, which is the same shape as the
`ddl` skill's model proposal: present a table of proposed operations with the
evidence and a confidence for each **before** writing any YAML.

| Operation | Purpose | Source | Confidence |
|---|---|---|---|
| `POST /carts/{id}/discounts` | apply a discount code | `discount.feature:8` "I apply the discount code" | inferred |
| `422` on an expired code | reject expired codes | `discount.feature:16` "This code has expired" | derived |
| `DELETE /carts/{id}/discounts` | remove a code | nothing in the specs | assumed |

- **derived** - the scenario states it (a status code, an explicit endpoint).
- **inferred** - a defensible reading of the wording; the *behaviour* is
  specified, the HTTP shape is your reading of it.
- **assumed** - normal REST design the scenarios say nothing about: resource
  granularity, pagination, auth scheme, error body shape, versioning.

Put the questions Gherkin cannot answer to the user, because they change the
spec: authentication scheme, the error response body, pagination, idempotency
for retries, and whether these endpoints are public or internal.

### 4. Report coverage both ways

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/openapi.cjs coverage features/ \
  --spec openapi.yaml \
  --out bdd-artifacts/openapi-coverage.html \
  --json bdd-artifacts/openapi-coverage.json \
  --base-path /api/v1 --labels zh-CN
```

| Option | Effect |
|---|---|
| `--spec <file>` | The document to check against. Required in coverage mode |
| `--base-path <prefix>` | Strip a common prefix (`/api/v1`) before matching, when scenarios and spec disagree about it |
| `--keep-ids` | Keep `/orders/1234` distinct instead of collapsing to `/orders/{id}` |
| `--fail-under <pct>` | Exit 1 below this operation coverage - for a CI gate |
| `--labels <tag>` | Report chrome: `en` \| `zh-CN` \| `zh-TW` \| `ja` |

Three findings come out of it, and all three matter:

1. **Uncovered operations** - documented, but no scenario exercises them. The
   headline number.
2. **Not-in-spec operations** - scenarios call an endpoint the document does not
   describe. Either the spec is stale or the test is hitting something it should
   not; say which you think it is.
3. **Business-only scenarios** - counted in neither direction. A high number
   here is not a failure; it means the suite specifies behaviour above the HTTP
   layer, and operation coverage is simply the wrong measure for it.

Exit codes: `0` ok, `1` `--fail-under` not met, `2` no feature files, no
`--spec`, or a spec with no `paths:` block.

### 5. Check before handing over

- **Validate the document.** If the project has a validator (`redocly lint`,
  `spectral lint`, `swagger-cli validate`), run it. If not, say the spec was
  never machine-validated rather than implying it was.
- **Re-read the scenarios against the spec**: can every example payload a
  scenario uses be expressed by the schema, and does every status code a
  scenario asserts appear under its operation?
- **Report**: operations added or changed, which came from scenarios and which
  from code, every `assumed` item, and the coverage numbers with the
  business-only count beside them.

## Hard limits - say these out loud

- A path that appears in one scenario is one example of a path, not proof of the
  resource model. Two endpoints in the specs do not imply the other twelve.
- Absence from the specs is not evidence an endpoint should not exist. This
  skill can say what the suite covers; it cannot say what the API should be.
- Inferred schemas describe the examples, not the contract: optional fields that
  no example happened to include will look required-by-omission, and enums will
  look narrower than they are.
- Auth, rate limits, pagination and error envelopes are almost never in Gherkin.
  Propose them explicitly as `assumed`, never quietly.
- The YAML reader scans the `paths:` block line by line and does not follow
  `$ref`-ed path items or YAML anchors. When a document uses those, say the
  operation list may be incomplete, or check against its JSON form.

## Reference files

- `references/api-layer-gherkin.md` - what the extractor recognises, how request and response payloads are distinguished, and how to write scenarios that carry a contract without turning into HTTP scripts
- `references/design-proposal.md` - the proposal table, the confidence levels, and the questions to ask before writing YAML for business-only scenarios
