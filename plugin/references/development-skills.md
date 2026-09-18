# Development skills

Stack-specific guidance, read **while writing code**. These are not part of the
BDD loop and no phase runs them: they are references the code in hand either
needs or does not.

**This plugin ships none of them, deliberately.** Official scaffolds already
install the right one - `create-expo-app` enables `expo@claude-plugins-official`
and writes a `CLAUDE.md`, `create-next-app` and others do the same - and a copy
carried here would be a second, staler answer to a question the project has
already answered. What this plugin does instead is **find what the project has
and use it.**

**This file is the procedure.** `commands/implement.md` and both task plan
templates point here rather than naming any plugin, because this plugin drives
TypeScript, Java, Python and .NET, and a phase naming one stack's guidance would
be wrong for the other three.

## Finding them

Do this once per plan, in Phase 0 (BDD) or Phase 1 (general), and write the
result down. **Check every source - a project can have more than one, and the
sources do not agree by construction:**

| Source | How to check | What it tells you |
|---|---|---|
| Enabled plugins | `cat .claude/settings.json .claude/settings.local.json 2>/dev/null` - the `enabledPlugins` keys, e.g. `expo@claude-plugins-official` | What the scaffold or the team installed for this project. The authoritative list |
| This session's skills | The available-skills list in context. A plugin's skills appear as `<plugin>:<skill>` | Which of them this session can actually invoke |
| Project-local skills | `ls .claude/skills/*/SKILL.md .claude/agents/*.md 2>/dev/null` | Guidance the team wrote for this repository and installed nowhere else |
| Repository instructions | The root `CLAUDE.md` / `AGENTS.md` | A scaffold may put the rule here instead of in a skill, and it binds either way |
| Documentation servers | `.mcp.json`, and the MCP servers in context (`context7` and framework-specific ones) | Where to get the framework's current docs when no plugin covers the question |

**A plugin that is installed but not enabled is present, not absent.** Say which
it is and ask whether to enable it, rather than recording a gap that is really a
switch nobody flipped.

## Choosing among what you found

A plugin applies to the stack **its own name and description say it applies
to** - read that, do not infer it from the framework being roughly similar.

**Where two apply, both apply.** A framework and the layer built on top of it -
Vue and Nuxt, React and Next.js - are not a subset of one another, and the outer
one's guidance does not contain the inner one's. Read both.

**Where one is for a neighbouring stack, neither applies.** Web React guidance
is not React Native guidance: bundle splitting and hydration have no meaning
where there is no bundle and no DOM. A near miss is a miss.

## Reading them

Invoke the skill by its `<plugin>:<skill>` name when this session lists it. When
it does not - the plugin is installed but its skills are not in context - read
the file:

```sh
ls ~/.claude/plugins/cache/*/<plugin>/*/skills/*/SKILL.md
```

Project-local ones are at `.claude/skills/<name>/SKILL.md`.

## When nothing is found

**Say so, and say where you looked.** A stack whose plugin is not installed has
no guidance here - do not substitute generic advice and present it as this
project's convention, and do not reach for a plugin written for a different
stack.

Name the official one once, if the framework has one - it is usually one
`/plugin install` away and the user may simply not know - then carry on with the
repository's own conventions as the only authority, and record the absence in
`findings.md`.

## Recording what it changed

**"Read it, it changed nothing" is a different fact from never having opened
it**, and only one of them can be checked afterwards. Write down which in
`progress.md`, naming the plugin and the skill.
