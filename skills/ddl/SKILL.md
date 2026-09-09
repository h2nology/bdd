---
name: ddl
description: This skill should be used when a database schema must be derived from Gherkin - for example "generate DDL from the feature files", "create the tables for these scenarios", "what does this feature imply for the data model", "write a migration from these acceptance criteria", "derive the schema from the data tables in our features", or when the entities and fields named in scenarios need to become CREATE TABLE statements for PostgreSQL, MySQL, Oracle, SQL Server or SQLite.
---

# Gherkin to database DDL

Derive a data model from the entities, fields and rules expressed in feature
files, confirm it with the user, and emit DDL in the project's dialect and
migration tool.

Gherkin describes **behaviour**, not storage. It under-specifies almost every
schema decision, so the output of this skill is always a proposal with its
inferences labelled - never a silent design.

## Communication policy

- DDL, identifiers, comments and migration files in **English**.
- Discuss the model and its open questions with the user in **their** language.

## Workflow

### 1. Collect the evidence from the specs

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/spec-report.cjs features/ --json bdd-artifacts/spec.json
```

Then read the feature files themselves - the JSON model gives the inventory, the
Gherkin gives the wording that carries the model. Harvest:

- **Data table headers** - the strongest signal. `| sku | name | price |` names
  three attributes of one entity.
- **"the following <entities> exist:" / "a <entity> with ..."** - entity names.
- **Field mentions in step text** - `"I sign in as {string}"` implies an
  identifying credential attribute.
- **Rules** - uniqueness, required fields, allowed values, limits, and
  relationships (see `references/modeling-rules.md`).
- **Scenario Outline value sets** - candidate enumerations.
- **Status words** - `pending`, `confirmed`, `cancelled` imply a state column
  and its allowed values.

### 2. Check what already exists

Never propose a schema without looking for the current one:

```bash
ls migrations db/migrate src/main/resources/db prisma alembic 2>/dev/null
find . -name '*.sql' -not -path '*/node_modules/*' | head -20
grep -rlE "CREATE TABLE|@Entity|class .*\(Base\)|DbSet<" --include='*.sql' --include='*.java' \
  --include='*.py' --include='*.cs' --include='*.ts' . 2>/dev/null | head -20
```

If tables already exist, the deliverable is a **migration that adds what the
scenarios require**, not a fresh schema. State clearly which existing tables and
columns you are extending, and never propose a change that would lose data
without saying so explicitly.

### 3. Determine the dialect

Detect from the project - `docker-compose.yml`, connection strings, the ORM
driver, existing migration syntax - and state what you found. Ask the user only
when detection is genuinely ambiguous. Then read the matching reference:

| Dialect | Reference |
|---|---|
| PostgreSQL | `references/postgresql.md` |
| MySQL / MariaDB | `references/mysql.md` |
| Oracle | `references/oracle.md` |
| SQL Server | `references/sqlserver.md` |
| SQLite | `references/sqlite.md` |

### 4. Build and confirm the conceptual model first

Present a table to the user **before** writing DDL:

| Entity | Attribute | Type | Null | Source | Confidence |
|---|---|---|---|---|---|
| products | sku | short text, unique | no | `checkout.feature:8` data table | derived |
| products | price | decimal(12,2) | no | value `12.50` | inferred |
| orders | status | enum(pending, confirmed, cancelled) | no | outline rows `checkout.feature:34` | inferred |
| orders | customer_id | FK -> customers.id | no | "signed in as" + "my cart" | assumed |

Confidence values, used consistently:

- **derived** - stated explicitly in the Gherkin (a table header, an explicit rule).
- **inferred** - deduced from example values or wording, and defensible.
- **assumed** - a normal design choice Gherkin says nothing about (surrogate
  keys, audit columns, indexes). Every assumption must be listed.

Also put the questions Gherkin cannot answer to the user (they change the DDL):
primary key strategy, soft vs hard deletion, audit columns, multi-tenancy,
retention, whether money needs a currency column, and **who wins when two people
save the same row at once** (see below).

### 4b. Decide the concurrent-update policy

Two users open the same order, both save. Someone's work is about to disappear,
and the schema decides whether anyone notices. This is not a performance detail -
it is a business rule, and it is the one schema decision that is invisible until
it costs someone an afternoon.

Three answers, and only one of them needs a column:

| Policy | What happens to the second save | Schema cost |
|---|---|---|
| **Last write wins** | It overwrites, silently | None - but see the caveat below |
| **First write wins** (optimistic locking) | It is **rejected**; the user is told to reload and retry | A version column, or the dialect's native row version |
| **Pessimistic locking** | The second user cannot start editing until the first finishes | None; `SELECT ... FOR UPDATE` at runtime |

"First write wins" is the one people usually mean when they say a save should not
be lost. Note what it actually does: it does not merge, and it does not queue - it
*refuses* the stale write. That refusal has to reach the user, so the specs need a
scenario for it:

```gherkin
@REQ-1088
Scenario: Saving an order someone else has already changed
  Given a colleague has saved changes to order "SO-4471" since I opened it
  When I save my changes
  Then my changes are not applied
  And I see the message "This order was changed by someone else. Reload to continue."
```

**When this is `derived`**: a scenario like the one above exists, or the specs
mention two actors touching one record. Then the version column is not a
suggestion - the behaviour cannot be implemented without it.

**When this is `assumed`**: the specs are silent. Ask; do not quietly pick last
write wins because it needs no column. Silence in a specification is not consent
to lose data.

**The caveat on last write wins.** It is genuinely free only when a save writes
the whole row and losing the other person's copy is acceptable. If two users edit
*different fields* of the same row - one the address, one the phone number - a
whole-row `UPDATE` throws away the field it never touched, and nobody finds out.
If that is unacceptable, the write must set only the changed columns. Say this
out loud when the user picks this policy; most people have not pictured it.

Each dialect reference gives the concrete column or native mechanism.

### 5. Emit the DDL in the project's migration tool

Match the tool, do not introduce one:

| Tool | Output |
|---|---|
| Flyway | `src/main/resources/db/migration/V<n>__<description>.sql` |
| Liquibase | a changeset appended to the changelog |
| Alembic | `alembic revision -m "..."` then fill `upgrade()` / `downgrade()` |
| Django / Rails / EF Core | change the models, then generate the migration with the tool - do not hand-write it |
| Prisma / Drizzle / TypeORM | edit the schema/entities, then generate |
| knex / node-pg-migrate | a new migration file with `up` and `down` |
| No tool | one `.sql` file per logical change, numbered, with a matching rollback script |

Always include the reverse operation. A migration without a tested rollback is
an outage waiting to happen.

Annotate the DDL so the traceability survives:

```sql
-- Derived from features/checkout.feature (REQ-1042, REQ-1043)
-- Assumption: surrogate bigint identity keys; confirmed with the team 2026-09-08.
CREATE TABLE products (...);
```

### 6. Verify before reporting done

- Run the DDL against a scratch database if one is reachable (a disposable
  container or an in-memory SQLite for a syntax check). Say so if you could not.
- Never run migrations against a shared or production database. Ask.
- Re-read the scenarios against the schema: for each scenario, can every value
  it names be stored, and does every rule it states have an enforcement point
  (constraint, unique index, check)? Rules with no enforcement belong in the
  report as application-level responsibilities.
- Report: tables created/altered, constraints added, which rules are enforced by
  the database, which are left to the application, and every assumption.

## Hard limits - say these out loud

- Gherkin cannot express normalization. A data table in a scenario is a *view* of
  data, not a table design. Do not mirror it one-to-one without thinking.
- Absence of a field in the specs is not evidence the field is unnecessary.
- Performance structures (indexes beyond keys and uniqueness, partitioning)
  cannot be derived from behaviour; propose them as suggestions, tied to a
  scenario that implies a lookup pattern.
- Never generate DDL for data the specs treat as sensitive (payment card
  numbers, government ids) without naming the compliance implication and asking.

## Reference files

- `references/modeling-rules.md` - how each Gherkin construct maps to schema, and type inference rules
- `references/postgresql.md`, `references/mysql.md`, `references/oracle.md`, `references/sqlserver.md`, `references/sqlite.md` - per-dialect type mapping, idioms and pitfalls
