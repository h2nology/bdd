---
name: flow-map
description: This skill should be used when screenshots taken during a cucumber run must be turned into a page or screen transition overview - for example "capture screenshots during the BDD run", "generate a page flow diagram", "show me the screen transitions our tests cover", "which pages do our scenarios visit", "draw the app's screen flow", "make a screenshot gallery of the test run", or when a stakeholder wants to see the user journeys the suite exercises. Works for both the Playwright web lane and the Appium mobile lane.
version: 0.1.0
---

# Page / screen flow map from a cucumber run

Turn per-step screenshots captured during a run into a transition diagram
(Mermaid), a transition table, per-scenario journeys, and a screenshot gallery.

Both lanes feed the same generator:

| Lane | Driver | Node identity | Reported as |
|---|---|---|---|
| web | Playwright | the URL path | pages |
| mobile | Appium | the native screen name | screens |

## Communication policy

- Capture code, record fields and commands in **English**.
- Explain the diagram and findings to the user in **their** language; localize
  the report chrome with `--labels`.

## 1. Make sure the run captures

The capture hooks ship with the `init` skill's templates for every language. If
the project was set up by `init`, capture is already implemented and only needs
to be switched on:

```bash
# web lane (Playwright)
BDD_FLOW_CAPTURE=1 npx cucumber-js            # TypeScript/JavaScript
BDD_FLOW_CAPTURE=1 mvn test                   # Java
BDD_FLOW_CAPTURE=1 pytest                     # Python
BDD_FLOW_CAPTURE=1 dotnet test                # C#/.NET

# mobile lane (Appium)
BDD_FLOW_CAPTURE=1 BDD_DRIVER=appium BDD_PLATFORM=android npx cucumber-js -p mobile
```

If the project has no capture hooks, add them from the matching reference - the
web lane from `${CLAUDE_PLUGIN_ROOT}/skills/init/references/<language>.md`
("flow capture"), the mobile lane from
`${CLAUDE_PLUGIN_ROOT}/skills/init/references/appium.md`. Do not invent a
different record format: the exact schema is specified in
`references/capture-contract.md` and the generator depends on it.

Rules the capture must obey (all templates already do):

- One JSON line appended per **step**, to `${BDD_FLOW_DIR}/flow.ndjson`.
- One screenshot per step, path recorded in the line.
- Wrapped in try/catch: a screenshot failure must never fail a scenario.
- Off by default. Capture roughly doubles a run's wall time and produces one
  PNG per step, so never enable it in the fast feedback loop.

## 2. Generate the map

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/flow-map.cjs \
  --input bdd-artifacts/flow \
  --out bdd-artifacts/flow-map.html \
  --json bdd-artifacts/flow-map.json \
  --labels zh-CN
```

| Option | Effect |
|---|---|
| `--input <path>` | Capture directory or a single ndjson/json file. Repeatable. Default `bdd-artifacts/flow` |
| `--out <file>` | Output HTML (default `bdd-artifacts/flow-map.html`) |
| `--mermaid <file>` | Mermaid source path (default: the `--out` path with `.mmd`) |
| `--json <file>` | Structured model: pages, transitions, per-scenario paths |
| `--labels <tag>` | Report chrome language: `en` \| `zh-CN` \| `zh-TW` \| `ja` |
| `--keep-query` | Treat `?tab=a` and `?tab=b` as different pages (default: query ignored) |
| `--keep-ids` | Keep `/orders/1234` distinct instead of collapsing to `/orders/:id` |
| `--split-origin` | Prefix labels with the host, for flows crossing several origins |
| `--full-screens` | Mobile: keep package-qualified screen names (`com.example.app/.CartActivity`) |
| `--max-label <n>` | Truncate edge labels (step text) to n characters, default 42 |

Outputs: the HTML report, the `.mmd` Mermaid source (paste into a PR, a wiki, or
a Markdown viewer), and optionally the JSON model.

## 3. How pages and transitions are derived

- A **page** (web) is a normalized URL: origin dropped (unless
  `--split-origin`), query dropped (unless `--keep-query`), numeric / UUID /
  long-hex path segments collapsed to `:id` / `:uuid` / `:hash` (unless
  `--keep-ids`), SPA hash routes kept. Its label is the most frequent `<title>`
  seen on it.
- A **screen** (mobile) is the captured screen name with its package prefix
  dropped: `com.example.shop/.CartActivity` becomes `CartActivity`. Use
  `--full-screens` to keep the qualified name. When a capture set is entirely
  native, the report says "screens" instead of "pages".
- A **transition** is two consecutive captures in one scenario whose page keys
  differ. Its label is the most frequent step text that produced it, with the
  occurrence count. A transition seen in a failed step is drawn dashed.
- An **entry page** is the first page of a scenario; entry nodes are drawn with a
  thicker border.
- Repeated captures on the same page do not create self-loops; they raise the
  page's visit count.

## 4. What to look for - and tell the user

The diagram is a review artifact, not decoration. Read it for:

| Observation | What it usually means |
|---|---|
| A page with visits but no outgoing transition | A dead end, or the scenario ends there. Check whether a journey is unfinished |
| Unexpected node like `/login` in the middle of a flow | A session expiry or redirect the scenarios did not intend |
| Two nodes that should be one (`/cart` and `/cart/`) | Normalization gap - report it, do not silently merge |
| Many `:id` collapses on one path | Normal; use `--keep-ids` only when the specific record matters |
| A page nobody enters (0 entries, 1 visit) | Reached only mid-journey; fine, but check it has a direct-entry scenario if users can bookmark it |
| Pages in the app that appear nowhere | Untested screens. This is the most valuable finding - list them for the user |
| Dashed edges | The flow broke there; cross-reference the failing scenario in the coverage report |
| Mobile: every screen has the same name | A single-activity Android app with no per-screen identifier. The diagram is worthless until the app exposes one - see `${CLAUDE_PLUGIN_ROOT}/skills/init/references/appium.md` section 4 |
| Mobile: a WebView screen appears as a URL | Expected for hybrid apps: the capture records both, and `url` wins |

Point out coverage gaps explicitly: compare the map against the app's own
inventory - the router config for web, the activity/view-controller list
(`AndroidManifest.xml`, the storyboard or navigation graph) for mobile - and name
the pages or screens no scenario visits.

## 5. Reporting

Give the user:

1. Counts: scenarios, pages (or screens), transitions, screenshots - and which
   lane the capture came from.
2. Entry pages/screens, and any node with no outgoing transition.
3. The Mermaid source or the HTML path (say that the `.mmd` can be pasted into a
   PR description or wiki page, where it renders as a diagram).
4. Pages or screens no scenario visits, if the app's inventory is discoverable.
5. Whether the diagram rendered: the HTML loads Mermaid from a CDN, so on an
   offline machine the diagram area shows the source text instead. The
   transition table, journeys and gallery always work offline.

## 6. Housekeeping

- `bdd-artifacts/` must be git-ignored. Screenshots are large and worthless once
  the run is old.
- Screenshots may contain **real data** if the suite runs against a shared
  environment. Never publish the gallery externally without checking, and never
  commit it. Ask before publishing the report anywhere the user has not named.
- Mobile captures are heavier: full-device screenshots at 3x scale, one per step.
  A long suite produces hundreds of megabytes - tell the user before enabling
  capture on a full mobile run, and prefer `--tags` to capture one journey.
- Clear `bdd-artifacts/flow/` before a fresh capture run, otherwise the map
  mixes old and new journeys (records are appended, never truncated).

## Reference files

- `references/capture-contract.md` - the exact record schema, file layout and guarantees the hooks must satisfy
