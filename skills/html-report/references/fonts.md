# Multi-language font policy — html-report

The SSOT for `moai-content:html-report` web-font CDN URLs, licenses, preconnect patterns, and CSS override blocks. Coordinates with [`themes.md`](themes.md) to produce the final font stack from `theme × lang`.

Supported languages: `en`, `ja`, `zh-CN`, `zh-TW`, `ko`.

---

## Rationale for the font policy

The Thariq philosophy is intended to block the hallucination and runtime non-determinism problems caused by JS/CSS CDNs.
Font CDNs do not fall under that concern for the following reasons:

1. **No LLM hallucination risk** — a font `<link>` is a static URL with no class names or APIs
2. **No runtime non-determinism** — fonts are visual assets, not the result of JS execution
3. **Offline fallback** — if the font CDN is unavailable, the system-font fallback stack still renders correctly
4. **Cross-OS consistency is essential** — system fonts diverge sharply across macOS / Windows / iOS / Android, especially for CJK scripts

---

## Theme × lang composition rule

The final font stack is composed from two sources:

- **Theme** contributes the **primary face** — the brand voice (Inter for notion)
- **Lang** contributes the **CJK fallback chain** — what the browser draws when the primary face has no glyph for a CJK character

The renderer emits `--sans / --serif / --mono` as:

```
"<theme primary>", "<lang CJK primary>", "<lang CJK OS fallback>", <generic family>
```

Worked example for `theme=notion, lang=ja`:

```css
--sans:  "Inter", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif;
--serif: "Inter", "Noto Serif JP", "Hiragino Mincho ProN", ui-serif, serif;
--mono:  "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

The browser walks the chain glyph-by-glyph: Inter renders Latin letters, Noto Sans JP renders kanji/kana, Hiragino Sans kicks in if the Noto CDN is unreachable, system-ui as the final generic fallback.

For `lang=en`, there is no CJK fallback — the theme primary plus system-ui is enough.

---

## Per-`theme` primary faces

The primary face is the theme's character. It always renders Latin scripts; CJK fallback handles non-Latin glyphs.

| `theme` | sans primary | serif primary | mono primary |
|---------|--------------|---------------|--------------|
| `notion` | Inter | Inter (no separate serif) | JetBrains Mono |

When adding a new theme to `themes.md`, declare its primary triple alongside the token block.

---

## Per-`lang` CJK fallback chains

These are appended after the theme primary to provide script coverage.

| `lang` | CJK sans (web) | CJK serif (web) | CJK OS fallbacks (sans → serif) |
|--------|----------------|-----------------|----------------------------------|
| `en` | — | — | system-ui, -apple-system, "Segoe UI" |
| `ja` | Noto Sans JP | Noto Serif JP | "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic" → "Hiragino Mincho ProN", "Yu Mincho" |
| `zh-CN` | Noto Sans SC | Noto Serif SC | "PingFang SC", "Microsoft YaHei", "Source Han Sans SC" → "Songti SC", "SimSun", "Source Han Serif SC" |
| `zh-TW` | Noto Sans TC | Noto Serif TC | "PingFang TC", "Microsoft JhengHei", "Source Han Sans TC" → "PMingLiU", "Source Han Serif TC" |
| `ko` | Pretendard | Noto Serif KR | "Apple SD Gothic Neo", "Malgun Gothic" → "Apple SD Gothic Neo" |

### Optional `ko` sub-variants (selected via `font_stack` override)

| Variant | sans | serif | mono | CDN source |
|---------|------|-------|------|------------|
| `editorial` | Pretendard | Chosun Ilbo Myeongjo | JetBrains Mono | jsDelivr + noonfonts |
| `legal` | KoPubWorld Batang | KoPubWorld Batang Bold | JetBrains Mono | jsDelivr (noonfonts) |

---

## CDN URLs and licenses

### Inter — `lang=en` default sans
- **License**: OFL-1.1 (SIL Open Font License)
- **CDN**: Google Fonts API
- **URL**: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap`
- **preconnect hosts**: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`

### Source Serif 4 — `lang=en` default serif
- **License**: OFL-1.1
- **CDN**: Google Fonts API
- **URL**: `https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&display=swap`
- **preconnect hosts**: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`

### Noto Sans JP + Noto Serif JP — `lang=ja`
- **License**: OFL-1.1
- **CDN**: Google Fonts API
- **URL (combined)**: `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;700&display=swap`
- **preconnect hosts**: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`

### Noto Sans SC + Noto Serif SC — `lang=zh-CN`
- **License**: OFL-1.1
- **CDN**: Google Fonts API
- **URL (combined)**: `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;700&display=swap`
- **preconnect hosts**: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`

### Noto Sans TC + Noto Serif TC — `lang=zh-TW`
- **License**: OFL-1.1
- **CDN**: Google Fonts API
- **URL (combined)**: `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@400;700&display=swap`
- **preconnect hosts**: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`

### Pretendard — `lang=ko` default sans
- **License**: OFL-1.1
- **CDN**: jsDelivr (GitHub mirror, pinned v1.3.9)
- **URL**: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css`
- **Weights included**: 100–900 (Variable Font)
- **preconnect host**: `https://cdn.jsdelivr.net`

### Noto Serif KR — `lang=ko` default serif
- **License**: OFL-1.1
- **CDN**: Google Fonts API
- **URL**: `https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&display=swap`
- **preconnect hosts**: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`

### JetBrains Mono — shared `mono` across all languages
- **License**: Apache 2.0 — compatible with the cowork-plugins MIT license
- **CDN**: Google Fonts API
- **URL**: `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap`
- **preconnect hosts**: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`

### Chosun Ilbo Myeongjo — optional `ko` editorial serif
- **License**: Free (personal and commercial use allowed — operated by Chosun Ilbo; verify the latest license terms before redistribution)
- **CDN (reference)**: `https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/Chosunilbomyungjo.woff`
- **Note**: Self-hosting is recommended for production
- **preconnect host**: `https://cdn.jsdelivr.net`

### KoPubWorld Batang — optional `ko` legal sans/serif
- **License**: OFL-style (free distribution, personal and commercial use allowed — Korea Publishers Society)
- **CDN (reference)**: `https://cdn.jsdelivr.net/gh/Project-Noonnu/noonfonts_two@1.0/KoPubWorldBatangLight.woff`
- **Weights**: Light (400), Medium (500) — Bold weight requires a separate URL
- **Note**: Self-hosting from the official site (https://www.kopus.org/biz-electronic-font2/) is recommended
- **preconnect host**: `https://cdn.jsdelivr.net`

---

## Combined preconnect + `<link>` patterns

These are the exact HTML blocks the renderer injects into the `<head>` for each `lang`. One combined Google Fonts request keeps the policy at "single CDN exception".

### `lang=en`

```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Source+Serif+4:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
```

### `lang=ja`

```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap">
```

### `lang=zh-CN`

```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap">
```

### `lang=zh-TW`

```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap">
```

### `lang=ko`

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap">
```

### `lang=ko` editorial variant (Pretendard + Chosun Ilbo Myeongjo)

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  @font-face {
    font-family: "Chosunilbo Myungjo";
    src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/Chosunilbomyungjo.woff") format("woff");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
</style>
```

---

## Composed `--sans / --serif / --mono` examples

These are the final `:root` font-variable blocks the renderer emits for each combination. The composition is mechanical: theme primary → lang CJK → lang OS fallback → generic family.

### `theme=notion, lang=en`

```css
--sans:  "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
--serif: "Inter", ui-serif, Georgia, serif;
--mono:  "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

### `theme=notion, lang=ja`

```css
--sans:  "Inter", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif;
--serif: "Inter", "Noto Serif JP", "Hiragino Mincho ProN", ui-serif, serif;
--mono:  "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```


### `theme=notion, lang=ko`

```css
--sans:  "Inter", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
--serif: "Inter", "Noto Serif KR", "Apple SD Gothic Neo", ui-serif, serif;
--mono:  "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

### `theme=notion, lang=ko` with `font_stack=editorial`

```css
--sans:  "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
--serif: "Chosunilbo Myungjo", "Apple SD Gothic Neo", ui-serif, serif;
--mono:  "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

When `font_stack` is supplied, it overrides both theme primary and lang CJK — the override block wins entirely.

---

## Template integration

Templates expose three raw-HTML Mustache slots that the renderer fills based on `theme × lang`:

| Slot | Position | Content |
|------|----------|---------|
| `{{{font_links}}}` | Inside `<head>`, before `<style>` | The combined `<link rel="preconnect">` + `<link rel="stylesheet">` block. Picks the union of theme primary CDN + lang CJK CDN |
| `{{{font_vars_css}}}` | Inside `:root`, just below `{{{theme_tokens_css}}}` | The composed `--sans / --serif / --mono` declarations (see examples above) |
| `{{{theme_tokens_css}}}` | At the top of `:root` | The 22-token theme block (colors, grayscale, accents, radii, shadows). See [`themes.md`](themes.md). |

In addition, `<html lang="{{lang}}">` is parameterized, so the document language attribute matches the active output language.

Defaults: `theme=notion`, `lang=en`.

---

## Consistent `font-display: swap`

Every Google Fonts URL must include `&display=swap`. Pretendard (jsdelivr CSS), Chosun Ilbo Myeongjo, and KoPubWorld (direct woff) are all handled via `font-display: swap` inside `@font-face`.

---

## Change log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-09 | 1.0.0 | Wave 1 initial draft — 6 Korean-font mappings, CDN URLs, preconnect patterns |
| 2026-06-01 | 2.0.0 | Multi-language refactor — `lang` parameter drives font stack (en / ja / zh-CN / zh-TW / ko); Korean editorial/legal kept as optional `font_stack` variants |
