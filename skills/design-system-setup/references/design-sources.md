# Design system sources, detection, and compilation

## 1. Detecting what exists

**Check for all of them and record everything you find.** These are not
competing candidates - a `DESIGN.md` supplying tokens alongside a component
library supplying components is a normal setup, and an advisor can have
generated either of them. Stopping at the first hit reports a project as simpler
than it is.

Only when two of them define the *same value* differently is there a precedence
question, and then a hand-written `DESIGN.md` outranks a library's defaults
because someone decided it. Report the override; do not apply it silently.

### `DESIGN.md`

Project root, that exact filename. Do not look for `DESIGN-SYSTEM.md`,
`STYLEGUIDE.md` or `docs/design.md`: guessing filenames turns "why did it not
read my design doc" into a question the user cannot answer by looking.

Two shapes, and they are not equivalent:

- **`design.md` format** - has YAML frontmatter with at least one of `colors:`,
  `typography:`, `spacing:`. Machine-readable, and compilable (section 3).
- **Plain prose** - no frontmatter. Still a legitimate source and still the
  authority on intent, but there is nothing to compile. Say so rather than
  parsing colours out of sentences.

### A UI component library

**Any of them.** This table is the ones with known detection rules, not the list
of acceptable choices:

| Library | Detect by | Tokens live in | Component specs live in |
|---|---|---|---|
| shadcn/ui | `components.json` + `components/ui/` | `:root` in `app/globals.css` or `src/index.css` (`--primary`, `--radius`, …) | `cva` variants in `components/ui/*.tsx` |
| Ant Design | `antd` in `package.json` | `ConfigProvider` theme tokens | antd's own docs |
| MUI | `@mui/material` | `createTheme` | MUI's own docs |
| Bootstrap | `bootstrap` | `--bs-*` CSS variables, or SCSS variables | Bootstrap's own docs |
| Chakra | `@chakra-ui/react` | theme object | Chakra's own docs |
| Mantine | `@mantine/core` | `MantineProvider` theme | Mantine's own docs |
| Vuetify | `vuetify` | `theme` in the Vuetify plugin config | Vuetify's own docs |
| PrimeVue / PrimeReact | `primevue` / `primereact` | the active theme preset | Prime's own docs |
| Element Plus | `element-plus` | `--el-*` CSS variables | Element Plus's own docs |
| A company-internal library | a dependency nobody here recognizes | wherever it says | its own docs |

**A library not in this table still counts.** Find where it keeps its tokens -
a theme object, a set of CSS custom properties, a SCSS variables file - and
record that path. Do not tell a user their library is unsupported because this
table is finite, and never present shadcn/ui as the default choice: it is one
row here because its detection is unambiguous, not because it is preferred.

For every one of these the library's own files are the specification. Read them
when you need to know what is available; do not restate them anywhere.

### A design advisor's output

An advisor is a **tool that produces a spec**, not a kind of spec. What you
detect is what it left behind: `ui-ux-pro-max` writes a `MASTER.md` under
`design-system/`, with `pages/*.md` beside it where a page file overrides the
master for that page. It can equally have been asked to write a `DESIGN.md`, in
which case it is detected as one and its origin no longer matters.

**Glob for it - never assume the depth:**

```bash
find design-system -name 'MASTER.md' 2>/dev/null
```

`ui-ux-pro-max` nests its output under a project name
(`design-system/<project>/MASTER.md`, with `design-system/<project>/pages/`),
and that layout is the advisor's business, not ours. A detector that looks only
at `design-system/MASTER.md` reports "no design system" on a project that has
one - and because `plan-with-feature` turns that into a **hard stop** pointing
at `design-system-setup`, the user is told to redo the step they just finished.
Match the file wherever under `design-system/` it sits.

Because it is a tool, it coexists with everything: generating a palette for a
project that already runs a component library is an ordinary request, and so is
having it draft the `DESIGN.md` someone then edits.

If nothing at all exists, invoke an advisor to generate something. Default to `ui-ux-pro-max` when available; the user may name
another. Call it however that plugin documents and let it write in its own
format - this plugin holds no built-in knowledge of any advisor's interface, and
must not convert their output.

## 2. The `design.md` format

Google's `design.md`. Frontmatter carries the system:

```yaml
colors:
  primary: "#5645d4"
  on-primary: "#ffffff"
typography:
  body-md:
    fontFamily: Notion Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
rounded:  { md: 8px, lg: 12px, full: 9999px }
spacing:  { md: 16px, xl: 24px }
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
```

`{colors.primary}` is a reference into another section; it must be resolved to a
real value at compile time. The markdown body below the frontmatter holds usage
notes, do's and don'ts, responsive breakpoints and known gaps - prose for people,
not something to parse.

The format has its own checker, `npx @google/design.md lint DESIGN.md`. Run it
when the file is edited, and report what it says rather than re-implementing it.

## 3. Compilation targets

Only `DESIGN.md` in `design.md` format, and some advisor output, need this.
A component library needs none - its tokens are already loadable code.

| Stack | Detect by | Output |
|---|---|---|
| Plain CSS | no Tailwind, no SCSS, no CSS-in-JS | `styles/tokens.css` - `:root` custom properties |
| Tailwind v4 | `@import "tailwindcss"` in a CSS file, and **no** `tailwind.config.*` | the `@theme` block of that same CSS file |
| Tailwind v3 | `tailwind.config.*` | `theme.extend` in that config |
| SCSS | `*.scss` in the source tree | `_tokens.scss` |
| CSS-in-JS | `styled-components` / `@emotion/react` | `theme.ts` |

**Check the two Tailwind rows before the plain-CSS row.** Tailwind v4 is
CSS-first and ships no config file, so it matches neither the v3 row (no
`tailwind.config.*` to find) nor the plain-CSS row (Tailwind is present). Left
unresolved, the nearest-looking answer is a new `styles/tokens.css` - a second
file defining the same colours the project's own CSS already defines, which is
exactly the competing source of truth section 3 of the SKILL forbids. On v4 the
tokens belong in the CSS file that already imports Tailwind.

Where a component library also lives in that file - shadcn/ui keeps its
variables in `app/globals.css` or `src/index.css` - that file is the target.
Put the primitives in their own block and bind the library's existing variable
names to them, so the library's names stay the one place a value is decided.
Do not add a parallel set of `--color-*` names next to them.

What maps to what:

- **`colors`** → one custom property each: `primary` → `--color-primary`.
- **`spacing`, `rounded`** → same treatment: `--space-md`, `--radius-lg`.
- **`typography`** → each entry is an object, not a scalar. Emit a utility class
  per entry (`.text-body-md { font-family: …; font-size: …; }`), not five loose
  variables that callers have to reassemble correctly every time.
- **`components`** → compile to classes **only for the plain-CSS and SCSS
  stacks**, where there is nothing else to carry them (`.button-primary { … }`).
  On Tailwind or with a component library present, leave this section as a
  specification for people to follow: generating classes that compete with the
  library's own components creates exactly the second source of truth section 3
  of the SKILL forbids.

Every generated file starts with:

```
/* Generated by design-system-setup from DESIGN.md. Do not edit by hand -
   edit DESIGN.md and re-run the skill. */
```

Compilation is idempotent: same source, same output, and re-running after a
source change is the normal way to update.

## 4. How `plan-with-feature` reuses this

`design-system-setup` establishes the design system and reports where it is. It
does **not** record it in `task_plan.md` - that file does not exist yet when the
skill runs.

`plan-with-feature` runs later and does the recording:

1. Detect the design system with section 1 of this file.
2. Write which source it is, and its path, into the plan, so Phase 3.x knows what
   to build against.
3. If the feature is tagged `@web` and no source is found at all, stop and point
   at `design-system-setup`. Do not start a UI feature with nothing defining what
   its pages look like - the pages will come out unstyled, and no later phase
   checks for that.
