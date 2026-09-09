---
name: html-report
description: |
  A terminal skill that renders markdown reports into single-file, self-contained HTML.
  Based on Thariq Shihipar's "unreasonable effectiveness of HTML" philosophy — no
  external JS/CSS frameworks, with two sanctioned CDN exceptions:
  a font CDN for multi-language readability (en/ja/zh-CN/zh-TW/ko) and a pinned
  highlight.js for code-block syntax highlighting.

  Use this skill whenever the request matches any of the following:
  - "report as HTML", "make the weekly report as a single HTML file", "single-file HTML render"
  - "status report html", "financial statements HTML output", "report as one HTML file"
  - "printable HTML report", "HTML report to embed in an email"
  - "status briefing HTML", "incident report HTML", "business plan HTML"
  - "html-report mode=status", "html-report mode=financial", "html-report mode=plan"
  - "spec report html", "Gherkin specification as HTML", "feature files as one HTML file for sign-off"
  - "sketch html", "render the UI sketch", "wireframe board as HTML", "html-report mode=sketch"

user-invocable: true
version: 1.0.0
---

# html-report — single-file HTML report renderer

## Purpose and scope

`moai-content:html-report` is the **terminal renderer** of the cowork text-output pipeline.
It converts markdown reports produced by `moai-bi:executive-summary`, `moai-finance:financial-statements`, `moai-business:sbiz365-analyst`, and similar skills into **single-file, self-contained HTML**.

**Core principles (Thariq philosophy)**:
- Layout, data binding, and charts use only native HTML / CSS / inline SVG — no React, Vue, Tailwind, Chart.js, D3, htmx, or any framework-class JS
- No external CSS frameworks (Bootstrap, etc.)
- **Two sanctioned CDN dependencies**, both optional (the page degrades gracefully if either is unreachable):
  1. A web-font CDN — the only external stylesheet, required for cross-OS typographic consistency across en/ja/zh-CN/zh-TW/ko ([`references/fonts.md`](references/fonts.md))
  2. A pinned highlight.js script — **the only external JS**, scoped exclusively to code-block syntax highlighting ([`references/code-blocks.md`](references/code-blocks.md))

**One mode is exempt from the two principles above: `sketch`.** It renders a
pan/zoom wireframe board whose card positions, arrow endpoints and port offsets are
*computed coordinates*, not prose, so it needs a layout engine (elkjs) and the
interaction code to drive it. Rather than dilute the principles for every mode, the
`sketch` mode is the one mode this skill does **not** render itself: it delegates to
the bdd plugin's `sketch.cjs`, and the exemption travels with that delegation. See
the `sketch` mode section for the exact boundary.

**This skill does not replace markdown output.** The markdown remains the single source of truth; HTML rendering operates only as an additional branch.

---

## Inputs

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `markdown` | ✓ | — | The markdown body to convert. **`mode=spec` and `mode=sketch` take structured JSON instead** — see those mode sections below |
| `mode` | ✓ | — | Layout: `status` \| `incident` \| `plan` \| `explainer` \| `financial` \| `pr` \| `spec` \| `sketch` |
| `lang` | — | `en` | Script coverage: `en` \| `ja` \| `zh-CN` \| `zh-TW` \| `ko`. Drives `<html lang>` and the CJK font fallback |
| `theme` | — | `notion` | Visual style. `notion` is currently the only first-party theme; the 22-token contract makes adding another a drop-in change |
| `slug` | — | Auto-generated from the title | Output filename prefix |
| `output_path` | — | `<cwd>/reports/<slug>-<YYYYMMDD>.html` | Output path |
| `font_stack` | — | Per-`theme` × `lang` default | Font mapping override (advanced use only) |

`mode`, `lang`, and `theme` are orthogonal — every theme renders every mode in every
language. The exception is `mode=sketch`, which honours `lang` and `output_path` but
ignores `theme` and `font_stack`: its palette comes from the bdd plugin's shared
report CSS so a board sits beside the other bdd artefacts.

---

## Invocation protocol (MUST follow)

Before rendering the HTML, Claude **MUST** confirm one parameter with the user via the `AskUserQuestion` tool — unless the user's original request already names it:

1. **`lang`** — output language: `en` / `ja` / `zh-CN` / `zh-TW` / `ko`

**Wait for the user's response** before generating anything. Getting this wrong
means handing a reader a document in a language they do not read, which no amount
of layout quality rescues.

`theme` needs no question while `notion` is the only first-party theme. Reinstate
it here as a second question if another theme is ever added.

**Skip the question only when**:
- The user explicitly named the language (e.g., "make a Japanese status report" → `lang=ja`)
- Or the user is iterating on a previous render in the same conversation and the prior `lang` choice clearly carries over

Other inputs (`mode`, `slug`, `output_path`, `font_stack`) follow normal defaults or are inferred from the request — no confirmation needed for those.

---

## Output

A single `.html` file (`<cwd>/reports/<slug>-<YYYYMMDD>.html`):
- Size: ≤ 50KB (excluding font/highlight.js CDN traffic, measured before body compression)
- External dependencies: 1 font CDN `<link>` + 1 highlight.js `<script>` + 2–3 `preconnect`s
- Self-contained: opens directly in a browser, attachable to email, usable offline (code remains readable as plain monospaced text if highlight.js CDN is unreachable)

`mode=sketch` differs on the first two points and is documented in its own section:
a board runs slightly over 50KB and pulls elkjs from a CDN. It matches on the third —
it opens offline, falling back to a simpler layout.

| | modes `status`…`spec` | mode `sketch` |
|---|---|---|
| Rendered by | this skill, from a Mustache template | delegated to `sketch.cjs` |
| Input | markdown (`spec`: JSON) | JSON only |
| External JS | highlight.js, for code blocks only | elkjs, for graph layout |
| Size | ≤ 50KB | ~50–60KB, no cap |
| Offline | full fidelity | works, simpler edge routing |

---

## Eight modes

| Mode | Structural sections | Target skill |
|------|---------------------|--------------|
| **`status`** | 4 metric cards · highlights · completed-items table · Velocity SVG bar chart · Carryover | `moai-bi:executive-summary`, `moai-business:daily-briefing` |
| **`incident`** | TL;DR dark banner · timeline · log excerpts `<details>` · code diff panel · impact table · action checklist | `moai-legal:compliance-check` |
| **`plan`** | Summary KPI strip · milestone vertical timeline · data flow SVG · slice table · risk grid · success metrics | `moai-business:sbiz365-analyst` |
| **`explainer`** | Side nav · `<details>` collapsible steps · tabbed code blocks (vanilla JS) · FAQ accordion · callout boxes | `moai-research:*`, `moai-education:*` |
| **`financial`** | 4 KPI cards · income statement table (item/current/prior/change/change %) · Variance SVG horizontal bar chart · footnote panel | `moai-finance:financial-statements` |
| **`pr`** | TL;DR · PR meta row (files · +/− · branch) · Before/After 2-column cards · file tour `<details>` · key points · test checklist · rollout steps | `moai-business:investor-relations` |
| **`spec`** | 6 metric cards · sticky scenario index in a left column · requirement traceability matrix · untagged-scenario gap panel · feature/rule/scenario hierarchy with Gherkin steps · parse-warning panel | `bdd:spec-report` command |
| **`sketch`** | 4 metric cards · pan/zoom wireframe board · state-variant group frames · orthogonal transition arrows anchored to buttons · selection detail panel · open-questions panel | `bdd:sketch` skill |

#### Per-mode input slots summary

| Mode | Primary Mustache slots |
|------|------------------------|
| `status` | `{{title}}`, `{{#metrics}}`, `{{#highlights}}`, `{{#completed_rows}}`, `{{#chart_bars}}` |
| `incident` | `{{inc_id}}`, `{{severity}}`, `{{title}}`, `{{#tl_entries}}`, `{{#impact_rows}}`, `{{#actions}}` |
| `plan` | `{{title}}`, `{{#kpis}}`, `{{#milestones}}`, `{{diagram_svg}}`, `{{#slices}}`, `{{#risks}}`, `{{#metrics}}` |
| `explainer` | `{{title}}`, `{{lead}}`, `{{#steps}}`, `{{#config_tabs}}`, `{{#faq_items}}` |
| `financial` | `{{title}}`, `{{period}}`, `{{#kpis}}`, `{{#statement_rows}}`, `{{chart_height}}`, `{{#variance_bars}}` |
| `pr` | `{{pr_ref}}`, `{{title}}`, `{{author}}`, `{{branch}}`, `{{files_changed}}`, `{{additions}}`, `{{deletions}}`, `{{#focus_items}}`, `{{#test_items}}`, `{{#rollout_steps}}` |
| `spec` | `{{title}}`, `{{#metrics}}`, `{{#nav_features}}`, `{{#requirements}}`, `{{#untagged}}`, `{{#features}}`, `{{#warnings}}` |
| `sketch` | *no template* — CLI arguments to `sketch.cjs`: `--input`, `--out`, `--labels`, `--title` |

### `spec` mode: structured input, not markdown

This mode is the exception to the markdown pipeline. Its source is the JSON model
emitted by the bdd plugin's parser, because a specification carries structure that
markdown cannot round-trip — the traceability matrix, per-scenario `file:line`, tag
counts, and the feature/rule/scenario tree would all be flattened and guessed back.

```bash
node <plugin-root>/scripts/spec-report.cjs <feature-paths> --json <model.json>
```

Map the model onto the template slots:

| Template slot | Model field | Notes |
|---|---|---|
| `{{#metrics}}` | `stats.features/rules/scenarios/cases/steps/requirements` | Six cards. Set `warn: true` on a card whose value signals a gap |
| `{{#requirements}}` | `requirements` | One row per id, sorted naturally (`REQ-2` before `REQ-10`). `covered_by` from each entry's `featureName › name` + `uri:line` |
| `{{#untagged}}` | `untagged` | Scenarios with no requirement tag — the review gap list |
| `{{#nav_features}}` | `features` | The sticky index. One group per feature; the feature name and every scenario under it are links |
| `{{#features}}` | `features` + the feature files themselves | Read the Gherkin for step text, data tables, doc strings and the outline's `Examples` table; the JSON carries the inventory, not the prose |
| `{{#warnings}}` | `warnings` | Never hand over a report that still lists these — fix the Gherkin and re-run |

**Anchors must agree.** Every `.feature-block` and every `.scenario-card` carries
an `id`, and the index links to both — a reviewer jumps to a feature as often as
to one scenario. Generate anchors positionally (`f-<n>`, `sc-<feature>-<n>`)
rather than from feature or scenario names — names contain spaces, punctuation and CJK, and
a broken link in the index is worse than no index. Set `is_outline: true` on a
`Scenario Outline` so the index marks it.

**The Gherkin is reproduced verbatim.** Never translate, summarize or reflow step
text — reviewers sign off on the exact words the suite will execute. Only the
report chrome (headings, column labels, the eyebrow) follows `lang`.

**Steps render in mono with the keyword coloured.** Keep `Given`/`When`/`Then`
English as the bdd plugin's language policy requires, while the step text itself
may be in any language.

### `sketch` mode: delegated rendering, not a template

This is the one mode this skill does not render. It shells out:

```bash
node <plugin-root>/scripts/sketch.cjs \
  --input  <sketch-spec.json> \
  --out    <output_path> \
  --labels <lang> \
  --title  "<title>"
```

| This skill's input | Passed as | Notes |
|---|---|---|
| the sketch spec JSON | `--input` | Derived by the `bdd:sketch` skill from the feature files. Its contract is `skills/sketch/references/sketch-spec.md` |
| `lang` | `--labels` | `en` \| `zh-CN` \| `zh-TW` \| `ja`. **`ko` is not supported by the board yet** — say so and fall back to `en` rather than passing it through |
| `output_path` | `--out` | Defaults to `bdd-artifacts/sketch.html`, beside the other bdd artefacts, rather than `reports/` |
| `title` | `--title` | Optional; the script titles the board from the spec's `app.name` otherwise |
| `theme`, `font_stack` | — | Ignored. See the note under Inputs |

Also available: `--json <file>` writes the laid-out model, `--mermaid <file>` writes
the screen flow as Mermaid source for a PR or wiki.

**Why this mode is delegated.** Every other mode renders prose: re-rendering it
changes typography, never facts. A board renders *arithmetic*. Each wireframe
element is emitted at a fixed height so a card's declared height equals its content
height exactly, which is what lets an arrow end precisely on a card edge and a port
sit on the y of the button that triggers the transition. That arithmetic is pinned
to the CSS in `sketch.cjs` — the two are edited together and verified together.
Reproducing it from a Mustache template would put the same numbers in two places,
and the failure mode is not "slightly different spacing", it is arrows that miss
their buttons and cards whose content overflows: precisely the properties the board
exists to show.

**Consequently:** do not hand-write a board's HTML, do not "improve" the numbers in
`sketch.cjs` to match a template, and do not add `sketch.html.tmpl`. If a board
needs to look different, change `sketch.cjs` and its BOARD_CSS together.

**What this mode's exemption does and does not cover.** It covers exactly one
external script (elkjs, pinned, for graph layout) and the interaction code that
drives the board, inside boards only. It does not license a framework CDN, a build
step, or interaction JS in any other mode. A board also stays a single self-contained
file, and still opens offline — without elkjs it keeps the layout `sketch.cjs`
computed and says so in its toolbar.

**Before rendering, check the spec is worth rendering.** `sketch.cjs` exits `2` on a
missing, unparseable or screen-less spec, and on a transition pointing at a screen or
element id that does not exist. Those are defects in the derivation, not in the
renderer — fix the spec and re-run, the same way parse warnings are fixed before a
`spec` report ships.

**Report the open questions, not just the file.** A board's `openQuestions` are the
gaps the feature file does not determine; they are the reason to sketch before
building. Hand them over in the user's language.

---

## Theme system

A theme is a complete swap of the design-token block (colors, grayscale, semantic accents, radii, shadows, and primary fonts). Themes are visually distinct but produce the same HTML structure — only `:root` CSS variable values change.

| `theme` | Visual character | Recommended use |
|---------|------------------|-----------------|
| `notion` (default) | Familiar productivity tool. Signature purple primary, soft drop shadows, 12px card radius | Internal wikis, product retros, anything productivity-flavored |

Full theme contract (22 tokens), per-theme CSS blocks, and instructions for adding a new theme: [`references/themes.md`](references/themes.md).

## Multi-language font policy

This skill allows **a single font CDN `<link>` as the only external dependency**, used to ensure consistent typography across English, Japanese, Simplified Chinese, Traditional Chinese, and Korean output.

Using only system fonts breaks visual consistency due to per-OS fallbacks (e.g., ja: Hiragino Sans / Yu Gothic; zh: PingFang / Microsoft YaHei; ko: Apple SD Gothic Neo / Malgun Gothic), so the font CDN is required.

The final font stack is composed from **theme** (primary face — brand voice) and **lang** (CJK fallback chain — script coverage). Example:

```
theme=notion, lang=zh-CN
  → --sans: "Inter", "Noto Sans SC", "PingFang SC", system-ui, sans-serif;
```

The theme's primary face renders Latin characters; the lang's CJK font kicks in for CJK characters via browser font-fallback.

### Per-`lang` CJK font mapping

| `lang` | CJK sans | CJK serif | CDN source |
|--------|----------|-----------|------------|
| `en` | — (Latin-only) | — | Google Fonts |
| `ja` | Noto Sans JP | Noto Serif JP | Google Fonts |
| `zh-CN` | Noto Sans SC | Noto Serif SC | Google Fonts |
| `zh-TW` | Noto Sans TC | Noto Serif TC | Google Fonts |
| `ko` | Pretendard | Noto Serif KR | jsDelivr + Google Fonts |

Optional `ko` sub-variants (selected via `font_stack` override):

| Variant | sans | serif |
|---------|------|-------|
| `editorial` | Pretendard | Chosun Ilbo Myeongjo |
| `legal` | KoPubWorld Batang | KoPubWorld Batang Bold |

Detailed CDN URLs, preconnect patterns, and theme × lang composition rules: [`references/fonts.md`](references/fonts.md)

---

## Code highlighting

Fenced markdown code blocks (```` ```python ... ``` ````) are rendered server-side as raw HTML-escaped text wrapped in `<pre class="code-block" data-lang="python"><code class="language-python">…</code></pre>`. A pinned highlight.js script (v11.10.0 via jsDelivr) runs at page load and rewrites the inner HTML with token spans (`.hljs-keyword`, `.hljs-string`, …). The token palette is scoped to `.code-block` and uses theme tokens, so highlighting color follows the active theme (purple keywords in notion).

If the highlight.js CDN is unreachable, code still renders as plain monospaced text — no broken layout.

Pipeline, lang aliases, CSS palette, and diff-lexer rules: [`references/code-blocks.md`](references/code-blocks.md)

---

## Recommended chain integration

```
[text skill] → moai-core:ai-slop-reviewer → moai-content:humanize-<lang> → moai-content:html-report (mode=X, lang=Y, theme=Z)
```

Minimal chain (fast rendering):
```
[text skill] → moai-content:html-report (mode=X, lang=Y, theme=Z)
```

---

## Usage examples

**Example 1: Weekly status (English, productivity-tool look)**
```
mode=status, lang=en, theme=notion
```

**Example 2: Japanese financial statements (minimalist look)**
```
mode=financial, lang=ja
```

**Example 3: Simplified Chinese incident report (productivity-tool look)**
```
mode=incident, lang=zh-CN, theme=notion, severity=SEV-2
```

**Example 4: Korean PR review (productivity-tool look)**
```
mode=pr, lang=ko, theme=notion
```

**Example 5: Simplified Chinese UI sketch board (delegated to sketch.cjs)**
```
mode=sketch, lang=zh-CN, input=bdd-artifacts/sketch.json
```

---

## Non-goals

- [HARD] Do not replace the default markdown output — HTML is an additional rendering branch
- [HARD] Do not introduce React / Vue / Tailwind CDN / Chart.js / D3
- [HARD] Do not introduce a build step (webpack, vite, esbuild)
- [HARD] Do not extend `mode=sketch`'s elkjs/interaction exemption to any other
  mode, and do not render a board from a template — that mode delegates to
  `sketch.cjs` by design
- [HARD] Do not encroach on `moai-office:pptx-designer` (slides) territory
- [HARD] Do not encroach on `moai-data:data-visualizer` (standalone chart) territory
- No multi-file output — every deliverable is a single `.html` file

---

## Reference documents

### Design docs
- [`references/themes.md`](references/themes.md) — theme registry (notion), 22-token contract, theme authoring guide
- [`references/fonts.md`](references/fonts.md) — per-`lang` CJK font mapping, CDN URLs, preconnect patterns, theme × lang composition
- [`references/code-blocks.md`](references/code-blocks.md) — fenced code block contract, highlight.js pipeline, `.code-block` CSS, diff format

### Theme inspiration specs (deeper brand translations)
- [`design/notion-design.md`](design/notion-design.md) — full Notion design-system spec (source for `theme=notion`)

### Templates
- [`references/templates/status.html.tmpl`](references/templates/status.html.tmpl) — status mode
- [`references/templates/incident.html.tmpl`](references/templates/incident.html.tmpl) — incident mode
- [`references/templates/plan.html.tmpl`](references/templates/plan.html.tmpl) — plan mode
- [`references/templates/explainer.html.tmpl`](references/templates/explainer.html.tmpl) — explainer mode
- [`references/templates/financial.html.tmpl`](references/templates/financial.html.tmpl) — financial mode
- [`references/templates/pr.html.tmpl`](references/templates/pr.html.tmpl) — pr mode
- [`references/templates/spec.html.tmpl`](references/templates/spec.html.tmpl) — spec mode
- `sketch` mode has **no template** by design — it delegates to the bdd plugin's
  `scripts/sketch.cjs`. Its input contract is
  [`../sketch/references/sketch-spec.md`](../sketch/references/sketch-spec.md) and the
  element vocabulary is
  [`../sketch/references/wireframe-vocabulary.md`](../sketch/references/wireframe-vocabulary.md)

Origin essay: [Thariq Shihipar, "The Unreasonable Effectiveness of HTML"](https://thariqs.github.io/html-effectiveness/)

---

## Consumer skill compatibility

Results from integration tests that render the markdown output of four upstream consumer skills with the html-report templates.

| Consumer skill | Suitable mode | Input file | Rendered output | Compatibility |
|----------------|---------------|------------|-----------------|---------------|
| `moai-bi:executive-summary` | `status` | [`references/integration-tests/executive-summary-input.md`](references/integration-tests/executive-summary-input.md) | [`references/integration-tests/executive-summary-rendered.html`](references/integration-tests/executive-summary-rendered.html) | ★★★★☆ (4/5) |
| `moai-finance:financial-statements` | `financial` | [`references/integration-tests/financial-statements-input.md`](references/integration-tests/financial-statements-input.md) | [`references/integration-tests/financial-statements-rendered.html`](references/integration-tests/financial-statements-rendered.html) | ★★★★☆ (4/5) |
| `moai-business:sbiz365-analyst` | `plan` | [`references/integration-tests/sbiz365-analyst-input.md`](references/integration-tests/sbiz365-analyst-input.md) | [`references/integration-tests/sbiz365-analyst-rendered.html`](references/integration-tests/sbiz365-analyst-rendered.html) | ★★★★☆ (4/5) |
| `moai-business:daily-briefing` | `status` (daily variant) | [`references/integration-tests/daily-briefing-input.md`](references/integration-tests/daily-briefing-input.md) | [`references/integration-tests/daily-briefing-rendered.html`](references/integration-tests/daily-briefing-rendered.html) | ★★★★☆ (4/5) |

| `bdd:sketch` | `sketch` | [`../sketch/references/sketch-spec.md`](../sketch/references/sketch-spec.md) (JSON contract) | rendered by `scripts/sketch.cjs` | n/a — delegated |

Detailed compatibility analysis: [`references/integration-tests/COMPATIBILITY.md`](references/integration-tests/COMPATIBILITY.md)
