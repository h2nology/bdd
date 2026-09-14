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
| `react-best-practices` | The code being written or reviewed is React or Next.js | 69 performance rules from Vercel Engineering across 8 categories, ordered by impact |

Read one at `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`. They carry
`user-invocable: false` - they are read when the work brings them up, not run as
a command.

## When no row applies

A stack with no row here has no reference in this plugin yet. Say so, rather
than reaching for one written for a different stack: React's rendering rules are
not advice about Spring.

## Recording what it changed

**"Read it, it changed nothing" is a different fact from never having opened
it**, and only one of them can be checked afterwards. Write down which in
`progress.md`, naming the skill.
