---
name: design-system-setup
description: This skill should be used when a UI project needs a design system in place before pages get built, or when an existing one must be re-synced - for example "set up the design system", "add design tokens to this project", "we have no styling conventions", "wire up our DESIGN.md", "compile the design tokens", "the pages we build come out unstyled", "make shadcn's tokens usable here", "wire up Ant Design's theme", or when a feature tagged @web is about to be implemented and nothing defines what its pages should look like. Establishes what the pages should look like - colours, typography, spacing, components - from whatever the project already has, and compiles it into tokens the code can actually reference.
---

# Set up a design system

Gherkin says what a page does, never what it looks like. Without a design system
the outside-in loop is asked to write "the minimum code that passes the test",
and the minimum is an unstyled page. This skill gives that loop something to
build against.

**Web lane only.** The mobile lane's component systems (Compose, SwiftUI, React
Native) are not covered yet - say so rather than improvising one.

## What this skill does not do

It does **not** verify that the pages built later actually follow the design
system. Nothing here fails when a developer ignores it. That check belongs to a
later version; until then the design system is a specification, not a gate. Say
this plainly when reporting - a user who believes styling is now enforced will
be surprised at the worst moment.

## Communication policy

- Generated code, config, token names and file comments in **English**.
- The design system's own content follows whatever its source already uses -
  never translate a `DESIGN.md` or a component library's token names.
- Explain what was found, chosen and generated to the user in **their** language.

## Procedure

### 1. Inspect before writing anything

```bash
ls DESIGN.md
cat components.json 2>/dev/null
grep -E '"(tailwindcss|antd|@mui/material|bootstrap|@chakra-ui|@mantine/core)"' package.json 2>/dev/null
ls tailwind.config.* app/globals.css src/index.css src/styles/ styles/ 2>/dev/null
ls design-system/ 2>/dev/null
grep -E '"(playwright|@playwright/test|appium)"' package.json 2>/dev/null
```

Determine and report:

- **Every part that already exists** - a `DESIGN.md`, a component library, an
  advisor's output. They coexist; record all of them rather than stopping at the
  first. `references/design-sources.md` has the detection rules.
- **The lane.** Playwright in the dependencies means web; Appium means mobile.
  This skill must run standalone (a project can have a harness already and want
  only a design system), so detect the lane here rather than expecting it to be
  passed in.
- **The stack**, which decides the compilation target: plain CSS, Tailwind,
  SCSS, or CSS-in-JS.

### 2. Two parts, and they rarely come from one place

A design system here answers two separate questions, and a project usually
answers them from different places:

| Part | Comes from |
|---|---|
| **The spec** - colours, typography, spacing, the values | A `DESIGN.md`, or the tokens a component library ships, or a file a design advisor generated |
| **The implementation** - what you actually write in a page | A component library, or the project's own CSS and components |

`DESIGN.md` defining tokens **and** a component library supplying components is
a normal, good combination - not a conflict to resolve. So is a component
library alone, or a `DESIGN.md` alone with hand-written CSS. Detect every part
that exists and record all of them; do not stop at the first hit and do not make
the user pick one when they already have two.

**A design advisor is a tool, not a source.** `ui-ux-pro-max` and its kind
*produce* a spec - a `DESIGN.md`, or their own format - and that produced file is
the source from then on. This is why an advisor coexists with everything else:
generating a palette for a project that already runs a component library is an
ordinary thing to want, and so is having it write the `DESIGN.md` you then edit
by hand.

**Any component library counts.** shadcn/ui, Ant Design, MUI, Bootstrap, Chakra,
Mantine, Vuetify, a company's internal one - `references/design-sources.md` lists
the ones with known detection rules, and an unrecognized library still counts:
find where it keeps its tokens and record that. Never present shadcn/ui as *the*
choice; it is one row in a table.

**Only when nothing exists at all is there a decision to make**, and it is about
where to start, not which one to be stuck with:

- have an advisor generate a spec (default to `ui-ux-pro-max` when it is
  available; the user may name another, and may decline all of them)
- write a `DESIGN.md` by hand
- install a component library - whichever one the project wants

None of these forecloses the others. A project that installs a component library
today can add a `DESIGN.md` tomorrow, and re-running this skill will pick it up.
Say that when you ask, so the question reads as "where do we start" rather than
"choose one forever".

Prefer, when two parts disagree about the same value: a hand-written `DESIGN.md`
outranks a library's defaults, because someone decided it. Report the override
rather than applying it silently.

### 3. Never write a copy

Whatever the source is, **leave it in its own format**. Do not convert a
component library into a `DESIGN.md`, and do not restate a `DESIGN.md` as some
normalized file of our own.

The reason is concrete: shadcn/ui's real specification is its component source -
the `cva` variants in `components/ui/*.tsx` - and that source is alive. A
generated description of it is a second source of truth that goes stale the first
time someone edits a variant, while still looking authoritative. Every design
system in this plugin has exactly one home, and it is wherever it already lives.

### 4. Compile only what needs compiling

Code cannot read a YAML spec, so some sources need a compilation step and some
do not:

| Source | Compile? |
|---|---|
| shadcn/ui and similar | **No.** Its CSS variables are already in `globals.css` |
| `DESIGN.md` | **Yes.** It is YAML; resolve `{colors.primary}` references to real values |
| An advisor's generated file | **Usually.** It names CSS variables but may not have written them anywhere |

Targets per stack are in `references/design-sources.md`. Two rules:

- The output is **code, in the source tree** - not a document, and not in
  `bdd-artifacts/`.
- It is **generated and overwritten**, so put a header on it saying so. A hand
  edit there is lost on the next run, and the user should learn that from the
  file rather than from losing work.

When nothing needs compiling, generate nothing. Confirming that the library is
installed and its styles actually load is the whole job in that case.

### 5. Report where the design system lives

Say plainly which of the three it is and what path holds it.

Do **not** write this into `task_plan.md` - that file does not exist yet at this
point in the flow. `plan-with-feature` runs later, detects the design system with
the same rules in `references/design-sources.md`, and records it there for
Phase 3.x to follow.

### 6. Prove it works before reporting success

A design system that has never rendered is not set up. Always:

1. Write a throwaway demo page that uses the main tokens and one instance of each
   component family the source defines.
2. Serve it and open it with the project's Playwright install.
3. Screenshot it and show the user.
4. Delete the demo page unless the user wants to keep it.

**When the project has no Playwright** - which happens when this skill is run on
its own, before any harness exists - still write the demo page, and tell the user
the path to open themselves. Degrade the check; do not skip it and do not install
a browser driver just for this. Say plainly that the rendering was not verified
here.

Installing a dependency is not evidence that styling works. A missing stylesheet
import, an unbuilt Tailwind layer, or a token file nothing imports all survive
installation and all produce exactly the unstyled pages this skill exists to
prevent.

Report what rendered, and anything you could not verify.

## Re-running on a project that already has one

Re-running means **update**, not repair. That is the opposite of `bdd-setup`,
whose re-run fixes a broken harness, and it is why the two are separate skills.

| Situation | Do |
|---|---|
| `DESIGN.md` changed | Recompile the tokens; report which values moved |
| A component library was added to a project that had `DESIGN.md` | Record both - this is a normal pairing, not a conflict. Only where they define the same value does `DESIGN.md` win, and say so |
| Tokens were hand-edited in a generated file | Say the edits will be lost, show them, and ask whether they belong in the source instead |
| Two sources define the same value differently | Report both and let the user collapse them. Do not pick silently. Coexisting without overlap needs no action |

## Reference files

- `references/design-sources.md` - how to detect a `DESIGN.md`, any component library, or an advisor's output, the `design.md` format, per-stack compilation targets, and how `plan-with-feature` reuses the same detection
