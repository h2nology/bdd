# Development skills

Stack-specific guidance, read **while writing code**. These are not part of the
BDD loop and no phase runs them: they are references the code in hand either
needs or does not.

**This file is the table.** `commands/implement.md` and both task plan templates
point here rather than at any skill in it, because this plugin drives
TypeScript, Java, Python and .NET - a phase naming one stack's guidance would be
wrong for the other three. Adding a reference for another stack is an edit to
this table and nothing else: no template changes, no phase changes, no command
changes.

| Skill | Applies when | What it carries |
|---|---|---|
| `react-best-practices` | The code is React or Next.js **on the web** | 69 performance rules from Vercel Engineering across 8 categories, ordered by impact |
| `vue-patterns` | The code is Vue 3, Vite + Vue or Pinia - including the Vue layer of a Nuxt app | Composition API and `<script setup>`, reactivity, component architecture, Pinia, Vue Router, testing, SSR |
| `nuxt4-patterns` | The code is a Nuxt 4 app - SSR, hybrid rendering, route rules, page data fetching | Hydration safety, `useFetch` / `useAsyncData`, route rules, lazy loading, payload size |
| `react-native-skills` | The code is a React Native or Expo app | List performance, Reanimated animation, native UI patterns, monorepo and native-module config, across 8 categories by impact |

Read one at `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`. They carry
`user-invocable: false` - they are read when the work brings them up, not run as
a command.

## Where two rows both apply

**A Nuxt 4 app is both `vue-patterns` and `nuxt4-patterns`, and neither is a
subset of the other.** `vue-patterns` is the component and store layer -
`<script setup>`, reactivity, Pinia, the router. `nuxt4-patterns` is what Nuxt
puts on top of it - which render mode a route gets, and whether the server and
the client produce the same markup. Read both; a hydration mismatch is not a
reactivity bug, and a Pinia store shaped wrongly does not become right because
the route rule is.

**React Native is not web React.** `react-best-practices` is Vercel's web
guidance - bundle splitting, `next/dynamic`, server components - and most of it
has no meaning where there is no bundle to split and no DOM to hydrate. On a
React Native or Expo app read `react-native-skills` **instead of** it, not as
well.

## When no row applies

A stack with no row here has no reference in this plugin yet. Say so, rather
than reaching for one written for a different stack: React's rendering rules are
not advice about Spring.

## Recording what it changed

**"Read it, it changed nothing" is a different fact from never having opened
it**, and only one of them can be checked afterwards. Write down which in
`progress.md`, naming the skill.
