# Theme policy — html-report

The SSOT for `moai-content:html-report` visual themes. A theme is a complete swap of the design-token block: colors, grayscale, semantic accents, radii, shadows, and fonts. Mode (layout) and lang (script coverage) are orthogonal to theme — every theme renders every mode in every language.

This document defines:
1. The **theme token contract** — the 22 CSS variables every theme must declare
2. The **default theme selection** and how the renderer composes the final token block
3. The **first-party themes** shipped with html-report (notion)
4. How to **add a new theme**

---

## Why themes

The original Anthropic-warm palette (terracotta + sage on warm off-white) is one visual voice — appropriate for editorial and research reports. It is not appropriate for every document a team ships — a quarterly investor letter and a product launch retro want different voices, which is what the token contract exists to allow.

Themes let the caller match the visual identity of the consuming surface (investor portal, internal wiki, brand site) without touching templates or modes.

The user's chosen theme drives **only** `:root` token values. Template HTML structure, Mustache slots, and per-mode layout do not change.

---

## Theme token contract

Every theme MUST declare exactly these 22 CSS custom properties. The renderer assembles the block and injects it into the `{{{theme_tokens_css}}}` slot present in every template.

### Surface palette (7 tokens)

| Token | Role | Original Anthropic name kept for backward compat |
|-------|------|--------------------------------------------------|
| `--ivory` | Page background | Pure white in notion |
| `--paper` | Card / panel background | Almost always white |
| `--slate` | Strongest body text color (titles, key numbers) | Near-black, theme-tinted |
| `--clay` | **Primary accent** — links, CTA buttons, chart peaks | Purple in notion |
| `--clay-d` | Pressed / hover / high-risk variant of `--clay` | — |
| `--oat` | Secondary background — banners, gap panels | Bold yellow in notion |
| `--olive` | Positive-signal accent — uptrend deltas, success badges | Success green in notion. A theme may collapse this to a neutral if it draws no positive/negative distinction |

### Grayscale (4 tokens)

| Token | Role |
|-------|------|
| `--g100` | Lightest gray — table header background, section dividers |
| `--g300` | Border / hairline gray |
| `--g500` | Secondary text — labels, captions |
| `--g700` | Body emphasis / mid-strength text |

### Semantic accent extensions (6 tokens — new in v2.x)

These replace previously hardcoded hex colors in `incident` (diff lines), `plan` (severity dots), and `pr` (file change badges).

| Token | Role |
|-------|------|
| `--diff-add` | Foreground for unified-diff `+` lines |
| `--diff-del` | Foreground for unified-diff `-` lines |
| `--accent-positive-deep` | Foreground for positive states (low severity, new badge) |
| `--accent-positive-soft` | Background for positive states |
| `--accent-warn-deep` | Foreground for warning states (high severity, deleted badge) |
| `--accent-warn-soft` | Background for warning states |

### Radii (2 tokens)

| Token | Role |
|-------|------|
| `--radius-panel` | Card / chart panel / featured-row corners |
| `--radius-row` | Table-row / chip corners |

### Shadows (2 tokens)

| Token | Role |
|-------|------|
| `--shadow-card` | Default elevation for cards and chart panels |
| `--shadow-elevated` | Hero / featured-row elevation (used sparingly) |

### Fonts (provided by `{{{font_vars_css}}}` slot, not theme_tokens)

Fonts are handled separately — see [`fonts.md`](fonts.md) for the theme × lang composition rule. In short: theme contributes the primary face (Inter for notion); lang contributes the CJK fallback chain (e.g., Noto Sans JP for `lang=ja`).

---

## Renderer composition

```
input: mode, lang, theme
                │
                ▼
   theme registry (themes.md)              lang registry (fonts.md)
        │                                          │
        ▼                                          ▼
{{{theme_tokens_css}}}                   {{{font_vars_css}}}  +  {{{font_links}}}
        │                                          │
        └──────────────┬───────────────────────────┘
                       ▼
              Mustache rendering
                       │
                       ▼
              single .html file
```

The renderer:
1. Looks up the theme's 22-token block
2. Looks up the lang's CJK fallback chain
3. Composes `--sans / --serif / --mono` as `"<theme primary>", "<lang CJK>", <system fallback>`
4. Emits the theme block into `{{{theme_tokens_css}}}` and the composed font vars into `{{{font_vars_css}}}`
5. Emits the lang's `<link>` preconnect block into `{{{font_links}}}`

---

## Default theme

`theme=notion` is the default, and currently the only first-party theme, so callers can leave it unset. It carries the broadest visual neutrality and is the most familiar reading experience for productivity software users.

The theme mechanism itself stays intact — the 22-token contract and the
`{{{theme_tokens_css}}}` slot are what make a second theme a drop-in addition. See
"Adding a new theme" below.

---

## First-party themes

### `theme=notion`

Visual character: confident, illustration-rich, productivity-tool warmth. Signature purple primary accent. White-on-white surfaces with subtle hairlines. Cards float on soft drop shadows.

Source design spec: [`design/notion-design.md`](../design/notion-design.md).

```css
/* === theme: notion === */
:root {
  --ivory:  #FFFFFF;       /* canvas white */
  --paper:  #FFFFFF;
  --slate:  #1F1F1F;       /* ink */
  --clay:   #6759E8;       /* notion purple — signature primary CTA */
  --clay-d: #5240D4;       /* purple pressed */
  --oat:    #FDF6E2;       /* card-tint-yellow-bold — feature banner */
  --olive:  #2EAA7E;       /* semantic success green */
  --g100:   #F7F7F5;       /* surface soft */
  --g300:   #E6E6E3;       /* hairline */
  --g500:   #6B6B6B;       /* slate / steel */
  --g700:   #3E3E3C;       /* charcoal */
  --accent-positive-deep: #1F7A56;
  --accent-positive-soft: #D8EFE6;
  --accent-warn-deep:     #B5460E;
  --accent-warn-soft:     #FCE8D6;
  --diff-add:             #2EAA7E;
  --diff-del:             #E0533A;
  --radius-panel:         12px;
  --radius-row:           8px;
  --shadow-card:          0 4px 12px rgba(15,15,15,0.08);
  --shadow-elevated:      0 24px 48px -8px rgba(15,15,15,0.20);
}
```

Recommended `lang=en` font composition (defined in fonts.md):
- `--sans: "Inter", system-ui, -apple-system, sans-serif;`
- `--serif: "Inter", ui-serif, Georgia, serif;` (notion has no editorial serif)
- `--mono: "JetBrains Mono", ui-monospace, monospace;`

---

---

## Theme × lang × mode matrix

All combinations are valid. Theme drives appearance; lang drives script coverage; mode drives layout.

| Theme | Recommended use |
|-------|-----------------|
| `notion` | Internal wikis, product retros, specification sign-off, anything that should feel like a familiar productivity-tool document |

| Mode | Theme is more or less important? |
|------|----------------------------------|
| `status` / `financial` | High — these are seen frequently, theme defines the brand impression |
| `incident` / `pr` | Medium — function dominates, but theme helps cross-document consistency |
| `plan` / `explainer` | Medium — typography hierarchy is felt more than color |

---

## Adding a new theme

1. Pick a name (lowercase, hyphen-separated, e.g., `corporate-blue`, `editorial-cream`).
2. Define all 22 tokens. The renderer rejects partial themes — no token may be omitted.
3. Recommend a default `--sans / --serif / --mono` font triple in the theme's section. The renderer combines this with the active `lang`'s CJK fallback.
4. Add a section to this file: name, character, source inspiration (if any), the 22-token CSS block, the recommended font triple, and 1-2 usage notes — especially for unusual decisions, such as a theme that collapses positive/warn to a single neutral.
5. Add to `theme` enum in [`SKILL.md`](../SKILL.md).
6. (Optional) Add a `design/<theme-name>-design.md` deeper spec if the theme is meant to be a complete brand translation.

---

## Non-goals

- [HARD] Themes do not change templates, modes, or Mustache slots — only token values
- [HARD] Themes do not introduce new fonts or font CDN sources outside fonts.md's catalog. Theme font choice = one of {Inter, Source Serif 4, Noto Sans/Serif family, Pretendard, JetBrains Mono}
- [HARD] No animations, transitions, or interaction states tied to theme — html-report renders static documents
- Theme-driven dark mode: deferred. A dark-variant theme should be a separate top-level theme (`notion-dark`), not a CSS-media-query toggle

---

## Change log

| Date | Version | Changes |
|------|---------|---------|
| 2026-06-02 | 1.0.0 | Initial draft — theme contract (22 tokens), three first-party themes (notion default, tesla, anthropic-warm), `{{{theme_tokens_css}}}` slot defined |
| 2026-06-02 | 1.1.0 | Removed `anthropic-warm` theme — only `notion` (default) and `tesla` ship with the skill |
| 2026-09-08 | 1.2.0 | Removed `tesla` theme — `notion` is the only first-party theme; the token contract and authoring guide are unchanged |
