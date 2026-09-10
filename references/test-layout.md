# Where unit tests go

One hard rule, then the per-stack conventions.

## The rule: never beside the file under test

`lib/todos/validate.ts` and `lib/todos/validate.test.ts` in the same directory
is the layout this plugin does not use. Tests live under a test root that is
separate from the production tree.

Four reasons, in the order they usually bite:

1. **Frameworks that treat directories as meaning.** Next.js turns files under
   `app/` into routes; a `page.test.tsx` there is a route. Same story for any
   convention-over-configuration framework - a test file in the wrong tree is
   not inert, it is a feature nobody asked for.
2. **Build output.** A production build that globs the source tree ships the
   tests unless every config remembers to exclude them. The exclusion is easy
   to write and easy to forget, and forgetting it is silent.
3. **Coverage and lint configuration stop needing exceptions.** With a separate root,
   "measure this, do not measure that" is one path each, not a pattern that has
   to be kept in sync with a naming convention.
4. **Reading the tree tells you the shape of the system.** A directory listing
   of `lib/todos/` that is half implementation and half tests answers "what is
   in here" twice as slowly.

The counter-argument is real and worth stating: co-located tests are easier to
find, and a rename moves both files together. That trade is settled here in
favour of separation, and consistency across the four stacks is part of why -
Java and .NET have no co-location option at all, so a plugin that allowed it in
TypeScript would be giving two different answers to one question.

## Per stack

| Stack | Test root | Mirrors the source tree? |
|---|---|---|
| TypeScript / JavaScript | `test/` | Yes: `test/lib/todos/validate.test.ts` tests `lib/todos/validate.ts` |
| Python | `tests/` | Yes: `tests/todos/test_validate.py` tests `todos/validate.py` |
| Java | `src/test/java/` | Yes, by package - the build tool requires it |
| C# / .NET | a sibling project, `<Name>.Tests/` | Yes, by namespace |

Java and .NET are not a choice: Maven, Gradle and `dotnet test` all expect
those locations. TypeScript and Python have no enforced convention, so the
table above is this plugin's, and the runner config has to say so:

```typescript
// vitest.config.ts
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
```

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
```

Mirroring the source tree matters more than it looks: it makes "does this file
have a test?" a path calculation rather than a search, which is what lets the
Capability Queue name a test file before it exists.

## What this does not cover

**The BDD suite is not a unit test tree.** Feature files and step definitions
keep the location the `init` skill set up - `features/` for TypeScript and
Python, `src/test/resources/features/` for Java, `Features/` for .NET - because
cucumber's own conventions point there and the whole team reads them, not just
developers. The rule above is about the inner loop's tests.

**Test fixtures that talk to a real database** belong in the test root like any
other test. If they need a seam of their own - a truncate helper, a connection
the production code does not share - put it under the test root too, and keep
it separate from the application's own data layer: a fixture that seeds through
the repository under test cannot fail independently of it, so a bug in the
repository corrupts the setup and the assertion together and the test still
passes.
