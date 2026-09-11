---
description: Set a project up for BDD end to end - the cucumber harness, and the design system the UI work will be built against - by running the two setup skills in order.
argument-hint: "[stack, app URL, lane - anything the setup should already know]"
---

# Set up a project for BDD

Get a project from nothing to ready: a cucumber harness that can execute feature
files, and a design system that says what the pages built against them should
look like.

This command **orchestrates**. It makes no decisions of its own - both skills
below confirm their own plans with you, and either can be run on its own when
only one half is needed.

| Step | Skill | What it establishes |
|---|---|---|
| 1 | `bdd-setup` | cucumber + Playwright (web) or Appium (mobile), step definitions, hooks, the environment contract |
| 2 | `design-system-setup` | what the pages should look like - colours, typography, spacing, components - from whatever the project has, compiled into tokens the code can reference |

Arguments the user gave: `$ARGUMENTS`

## Why this is two skills and not one

They differ in every way that matters for when you run them:

- **Lifecycle.** A harness is installed once and then largely left alone; its
  re-run is a **repair**. A design system evolves with the product; its re-run is
  an **update**. One skill holding both meanings would do the wrong thing half
  the time.
- **Trigger.** A project can have either without the other. When
  `plan-with-feature` finds no design system, it should point at one skill, not
  make you re-run a whole initialization.
- **Size.** `bdd-setup` already covers four language stacks and two drivers.

## Procedure

### 1. Run `bdd-setup` first

It detects the language stack and the lane, and it installs Playwright. Step 2
needs all three, so this order is a dependency, not a convention.

If it cannot finish - dependencies refused, no app to point at, an ambiguous
stack - **stop there and report**. Do not run step 2 against a project whose
harness never came up.

### 2. Run `design-system-setup`, unless the lane rules it out

| What step 1 found | Do |
|---|---|
| web lane (alone or with mobile) | Run it |
| mobile lane only | **Skip it**, and say why: it covers the web lane only, because Compose / SwiftUI / React Native component systems are not supported yet |

Do not pre-judge whether the project "needs" a design system beyond that. It
detects an existing `DESIGN.md`, component library or advisor output on its own,
and does the right thing in each case - including doing almost nothing when the
project already has what it needs.

### 3. Report both halves together

In the user's language:

1. **The harness**: stack, lane, what was installed, and the result of the smoke
   run. A harness that never executed a scenario is not set up.
2. **The design system**: every source found and where each lives - a
   `DESIGN.md`, a component library, an advisor's output, or several together -
   what was compiled, and the demo page screenshot.
3. **What is not covered.** Two things are worth saying out loud because users
   assume otherwise:
   - Nothing checks that pages built later actually follow the design system.
     It is a specification, not a gate.
   - The mobile lane has no design system support yet, if that lane was set up.
4. **What comes next**: `/bdd:discover` if there are no feature files yet,
   otherwise `/bdd:plan-with-feature`.

## When one half already exists

Running this on a project that is partly set up is fine and expected - both
skills inspect before they write, and extend rather than overwrite. Say which
half was already there instead of reporting work that did not happen.

If the user only wants one half, point them at the skill directly:
`/bdd:bdd-setup` or `/bdd:design-system-setup`. There is no flag here for that,
because a skill you can call by name does not need one.
