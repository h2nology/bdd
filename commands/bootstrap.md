---
description: Set a project up for BDD - the cucumber harness that can execute feature files - by running the bdd-setup skill and reporting what comes next.
argument-hint: "[stack, app URL, lane - anything the setup should already know]"
---

# Set up a project for BDD

Get a project from nothing to able to execute a feature file: cucumber, a
driver, step definitions, and a smoke run that proves a scenario actually ran.

This command **orchestrates**. It makes no decisions of its own - `bdd-setup`
confirms its own plan with you, and can be run on its own.

Arguments the user gave: `$ARGUMENTS`

## What this does not set up

**The design system.** A `@web` feature needs one - Gherkin says what a page
does, never what it looks like - but this is the wrong moment to establish it,
for two reasons:

- **There are no feature files yet.** Nothing here can tell whether the project
  even has `@web` scenarios; the driver `bdd-setup` installed is a proxy for
  that, and it is wrong on every API-only project that uses Playwright.
- **When nothing exists yet, choosing a design system is a product decision.**
  Asking an advisor to generate colours and typography for a product it has no
  description of yields a generic template. The feature files are that
  description, and they do not exist at bootstrap.

`plan-with-feature` handles it instead, at the point where both are known: it
records what the project already has - a design plugin, a component library, a
`DESIGN.md` - and **asks the user** which to add when a `@web` feature has none
of them. What the user chooses is then built by **Phase 0.1 of that plan**,
driven by `/bdd:implement`: the component library installed, `DESIGN.md`'s
values mapped into it, the mapping shown to have taken effect.

So the design system does get installed by this plugin - just not here, and not
before there is a feature file to say the project needs one.

## Procedure

### 1. Run `bdd-setup`

It detects the language stack and the lane, installs the driver, writes the step
definitions and hooks, and smoke-runs a scenario.

If it cannot finish - dependencies refused, no app to point at, an ambiguous
stack - **stop there and report**. A harness that never executed a scenario is
not set up.

### 2. Report

In the user's language:

1. **The harness**: stack, lane, what was installed, and the result of the smoke
   run.
2. **What is not covered**: the design system, and when it gets decided and
   built - see above. Say it out loud; users assume `bootstrap` means
   everything.
3. **What comes next**: `/bdd:discover` if there are no feature files yet,
   otherwise `/bdd:plan-with-feature`.

## When the harness already exists

Running this on a project that is partly set up is fine and expected -
`bdd-setup` inspects before it writes, and re-running it is a **repair**. Say
what was already there instead of reporting work that did not happen.
