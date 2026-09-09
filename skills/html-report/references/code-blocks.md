# Code block policy — html-report

The SSOT for handling fenced markdown code blocks (```` ```lang ... ``` ````), inline code, and unified diffs across all 6 `html-report` modes. Defines the renderer contract, the standard `.code-block` CSS class, the highlight.js token palette mapping, and per-mode availability.

Goal: code rendered in any mode looks visually consistent, follows the active theme's accent colors, and uses a single well-maintained highlighter.

---

## Highlight.js as a sanctioned exception

The original Thariq philosophy bans browser-side JS for rendering — no Prism, no Shiki, no client-side computation. **Highlight.js is treated as a sanctioned exception, on the same footing as the single font-CDN exception:**

1. **No LLM hallucination risk** — highlight.js is a single static `<script>` URL, no per-render class generation
2. **Deterministic** — given the same code text + lexer, the output token stream is the same on every machine
3. **Graceful degradation** — if the CDN is unreachable, the code still renders as readable monospaced text (no broken page)
4. **Maintenance** — Pygments-style server-side highlighting requires keeping a token-class palette in sync with Pygments releases; highlight.js's class names (`.hljs-keyword`, etc.) are stable and well-documented

Server-side highlighting is no longer used. The renderer outputs raw code; the browser highlights at load time via highlight.js.

---

## Renderer contract

The renderer (Python or whatever drives template assembly) does **no** highlighting work itself. It simply:

### Phase 1 — extract

Parse the input markdown. For every fenced block (```` ```lang ... ``` ````), capture:
- `lang` — the language identifier (e.g., `python`, `bash`, `tsx`, `diff`, or empty)
- `code` — the raw source (preserving leading whitespace; only HTML-escape `<`, `>`, `&`)

### Phase 2 — wrap

Emit the block as:

```html
<pre class="code-block" data-lang="python"><code class="language-python">if bucket.tokens &gt;= cost:
    bucket.tokens -= cost
    return ALLOW</code></pre>
```

- `<pre>` carries the visual frame (background, padding, scroll, border).
- `data-lang` decorative attribute drives the top-right language tag via CSS.
- `<code class="language-X">` is highlight.js's discovery hook. The script picks up any `<code>` with `class="language-X"` (or `class="hljs"`) and rewrites its inner HTML into highlighted token spans.
- Raw text inside `<code>` must be HTML-escaped (`&lt;`, `&gt;`, `&amp;`) — the renderer is responsible for this.

### Lang aliases

Highlight.js's lexer names cover almost all common languages. Pass-through aliases the renderer should accept and map:

| Markdown fence | highlight.js `language-X` |
|----------------|---------------------------|
| `js`, `javascript` | `javascript` |
| `ts`, `typescript` | `typescript` |
| `tsx`, `jsx` | `typescript` (jsx parsing) |
| `sh`, `bash`, `shell`, `zsh` | `bash` |
| `py`, `python`, `python3` | `python` |
| `yml`, `yaml` | `yaml` |
| `kotlin`, `kt` | `kotlin` |
| `diff`, `patch` | `diff` |
| `nginx`, `nginxconf` | `nginx` |
| `http` | `http` |
| _(empty / unknown)_ | omit `language-X` and let highlight.js auto-detect |

If `lang` is empty, omit the `language-X` class — highlight.js will auto-detect (less reliable than explicit lang, but fine for incidental snippets).

---

## CDN integration

A single `<script>` tag plus a one-line initializer goes into every template's `<head>` (or just before `</body>`):

```html
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/highlight.min.js"></script>
<script>
  document.addEventListener("DOMContentLoaded", () => hljs.highlightAll());
</script>
```

The 11.10.0 release ships a "common" bundle with the 35 most-used languages. For specialty languages (Nginx, Rust, Haskell, etc.) the full URL is `highlight.min.js` plus per-language additions: `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/languages/nginx.min.js`.

- **License**: BSD-3-Clause — compatible with the cowork-plugins MIT
- **preconnect host**: `https://cdn.jsdelivr.net`
- **Size**: ~30 KB minified for the common bundle. Stays within the project's "single CDN exception" budget.

No theme CSS from highlight.js is loaded — we provide our own theme-token-driven palette below.

---

## Standard `.code-block` CSS

The renderer injects this CSS once per render via the `{{{code_block_css}}}` Mustache slot, which lives inside every template's `<style>` block. The slot pattern mirrors `{{{font_vars_css}}}` and `{{{theme_tokens_css}}}`.

All colors reference the theme tokens defined in [`themes.md`](themes.md). The palette is intentionally subdued — code is information-dense, so we avoid the rainbow look in favor of low-saturation theme-aligned tones.

```css
/* ============================================================
   Code block — standard wrapper (theme-token driven)
   See references/code-blocks.md
============================================================ */
.code-block {
  position: relative;
  background: var(--g100);
  border: 1px solid var(--g300);
  border-radius: var(--radius-panel);
  padding: 18px 20px;
  margin: 14px 0;
  overflow-x: auto;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--slate);
}
.code-block code,
.code-block code.hljs {
  font-family: inherit;
  font-size: inherit;
  background: none;
  padding: 0;
  white-space: pre;
}
.code-block[data-lang]::before {
  content: attr(data-lang);
  position: absolute;
  top: 8px;
  right: 12px;
  font-family: var(--sans);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--g500);
  pointer-events: none;
}

/* --- highlight.js token palette (scoped to .code-block) ---
   Class names follow highlight.js v11 conventions:
   https://github.com/highlightjs/highlight.js/blob/main/docs/css-classes-reference.rst */
.code-block .hljs                          { color: var(--slate); background: transparent; }
.code-block .hljs-keyword,
.code-block .hljs-selector-tag,
.code-block .hljs-section                  { color: var(--clay); font-weight: 500; }
.code-block .hljs-built_in,
.code-block .hljs-type,
.code-block .hljs-literal,
.code-block .hljs-number                   { color: var(--clay-d); }
.code-block .hljs-title,
.code-block .hljs-title.function_,
.code-block .hljs-title.class_             { color: var(--clay-d); }
.code-block .hljs-string,
.code-block .hljs-regexp,
.code-block .hljs-symbol,
.code-block .hljs-template-tag,
.code-block .hljs-template-variable        { color: var(--olive); }
.code-block .hljs-comment,
.code-block .hljs-quote,
.code-block .hljs-meta                     { color: var(--g500); font-style: italic; }
.code-block .hljs-meta .hljs-string        { color: var(--olive); font-style: normal; }
.code-block .hljs-attr,
.code-block .hljs-attribute,
.code-block .hljs-name                     { color: var(--slate); }
.code-block .hljs-tag                      { color: var(--clay); }
.code-block .hljs-variable,
.code-block .hljs-params                   { color: var(--slate); }
.code-block .hljs-operator,
.code-block .hljs-punctuation              { color: var(--g700); }
.code-block .hljs-decorator                { color: var(--olive); }

/* --- Unified diff (language-diff) --- */
.code-block .hljs-addition                 { color: var(--diff-add); background: var(--accent-positive-soft); display: block; }
.code-block .hljs-deletion                 { color: var(--diff-del); background: var(--accent-warn-soft); display: block; }
.code-block .hljs-comment.hljs-meta        { color: var(--g500); }
```

---

## Per-mode availability

| Mode | Generic `.code-block` | Tabbed code (multi-variant) | Diff panel | Inline `<code>` |
|------|-----------------------|------------------------------|------------|-----------------|
| `status` | ✓ (via slot) | — | — | ✓ |
| `incident` | ✓ (via slot) | — | ✓ (`.code-panel` + `.diff-line.*` for hand-rolled diffs; `language-diff` for fences) | ✓ |
| `plan` | ✓ (via slot) | — | — | ✓ |
| `explainer` | ✓ (via slot) | ✓ (`{{#config_tabs}}` with `code_html`) | — | ✓ |
| `financial` | ✓ (via slot) | — | — | ✓ |
| `pr` | ✓ (via slot) | — | partial (Before/After cards accept `code_html`) | ✓ |

All six modes carry the `{{{code_block_css}}}` slot, so a fenced block in input markdown renders identically across modes.

---

## End-to-end flow

```
input.md
  ```python
  def hello(name: str) -> str:
      return f"hi {name}"
  ```
        │
        ▼  renderer phase 1 (markdown parser)
{ lang: "python", code: "def hello(name: str) -> str:\n    return f\"hi {name}\"\n" }
        │
        ▼  renderer phase 2 (HTML-escape + wrap; NO highlighting)
<pre class="code-block" data-lang="python"><code class="language-python">def hello(name: str) -&gt; str:
    return f"hi {name}"
</code></pre>
        │
        ▼  injected into template via Mustache triple-stash
{{{body_html}}}    or   {{{code_html}}}
        │
        ▼  template <head> contains highlight.js <script>
        ▼  on DOMContentLoaded, hljs.highlightAll() walks all <code class="language-X">
        ▼  rewrites their inner HTML to add <span class="hljs-keyword">def</span> etc.
        │
        ▼  template <style> contains {{{code_block_css}}} → hljs classes pick up theme tokens
final .html (single file, ~30 KB JS dependency from CDN)
```

---

## Inline code

Single-backtick spans (`` `foo()` ``) render as `<code>foo()</code>` with no extra class. Every template already styles bare `<code>` with `font-family: var(--mono); font-size: 13px;`, so inline code stays consistent without involving highlight.js (which only acts on `<code class="language-X">` inside `<pre>`).

For inline code that needs more emphasis (e.g., file paths in an `incident` TL;DR), use `<code class="inline">` — `incident.html.tmpl` already defines that hook.

---

## Non-goals

- [HARD] No Prism / Shiki / other browser-side highlighters — highlight.js is the single sanctioned choice for this skill, locked to a pinned version
- [HARD] No highlight.js theme CSS from the CDN — the palette is theme-driven via our tokens, not by highlight.js's built-in themes
- [HARD] No copy-to-clipboard button — keeps the JS surface minimal (only `hljs.highlightAll()` runs)
- Auto-detection of language when the fence has no `lang` tag — let highlight.js's auto-detect run; it's heuristic but adequate for incidental snippets

---

## Change log

| Date | Version | Changes |
|------|---------|---------|
| 2026-06-01 | 1.0.0 | Initial draft — Pygments-based server-side renderer contract, `.code-block` CSS palette mapped to Anthropic-warm design tokens, `{{{code_block_css}}}` slot defined |
| 2026-06-02 | 2.0.0 | Switched to highlight.js (browser-side). Pygments pipeline removed. CSS palette remapped from Pygments token classes (`.k`, `.s`, `.c`) to highlight.js classes (`.hljs-keyword`, `.hljs-string`, `.hljs-comment`). Highlight.js declared a sanctioned single-CDN exception. |
