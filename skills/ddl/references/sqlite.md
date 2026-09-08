# SQLite DDL

Target SQLite 3.37+ so `STRICT` tables are available. SQLite is usually the
test/dev database or an embedded store - if production runs another engine,
generate DDL for that one and use this only for the local harness.

## Type affinity, not types

SQLite stores whatever it is given; a column's declared type is only an
*affinity*. `age INTEGER` happily stores `'twenty'` unless the table is
`STRICT`. Always create tables as `STRICT` for new work:

```sql
CREATE TABLE products (...) STRICT;
```

`STRICT` allows only `INT`, `INTEGER`, `REAL`, `TEXT`, `BLOB`, `ANY`.

## Type mapping

| Logical type | SQLite (`STRICT`) | Notes |
|---|---|---|
| short / long text | `TEXT` | No length limit; enforce with `CHECK (length(col) <= 255)` |
| integer | `INTEGER` | 64-bit |
| big integer | `INTEGER` | Same type |
| decimal / money | `INTEGER` (minor units) or `TEXT` | **There is no exact decimal type.** Store minor units (cents) as INTEGER, or the decimal string as TEXT. `REAL` loses money |
| boolean | `INTEGER CHECK (col IN (0,1))` | No boolean type |
| date | `TEXT` (`'2026-09-08'`) | ISO-8601 sorts correctly as text |
| timestamp | `TEXT` (`'2026-09-08T10:00:02Z'`) | Store UTC in ISO-8601, or an INTEGER unix epoch |
| time | `TEXT` (`'10:00:00'`) | |
| uuid | `TEXT` | Or `BLOB` for 16 bytes |
| json | `TEXT CHECK (json_valid(col))` | The JSON1 functions are built in |
| enum | `TEXT CHECK (col IN (...))` | No native enum |
| binary | `BLOB` | |

Money is the decision to surface to the user: cents-as-INTEGER is exact and is
what the scenarios' `12.50` should become (`1250`), but it changes every query
and every application mapping.

## Primary keys

```sql
id INTEGER PRIMARY KEY          -- an alias for the rowid: the fastest key
```

- `INTEGER PRIMARY KEY` (exactly that spelling) is the rowid alias and
  auto-assigns. `AUTOINCREMENT` only prevents id reuse and costs a counter
  table - add it only when the requirement forbids reused ids.
- `BIGINT PRIMARY KEY` is **not** a rowid alias and does not auto-assign.

## Foreign keys are off by default

```sql
PRAGMA foreign_keys = ON;   -- per connection, every connection
```

Without this pragma the FK declarations are parsed and ignored. Put it in the
application's connection setup and say that you did, otherwise the schema
enforces nothing.

## Timestamps

```sql
created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
```

No auto-update: use a trigger.

```sql
CREATE TRIGGER orders_updated_at AFTER UPDATE ON orders
BEGIN
  UPDATE orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
```

## Limited ALTER TABLE

SQLite supports only `ADD COLUMN`, `RENAME COLUMN`, `RENAME TO` and
`DROP COLUMN` (3.35+). Anything else - changing a type, adding a constraint -
needs the twelve-step dance: create the new table, copy the rows, retire the old
one, rename. Migration tools do this for you; hand-written migrations must
follow the same order and run inside a transaction (DDL **is** transactional in
SQLite).

## Canonical example

```sql
-- Derived from features/checkout.feature (REQ-1042, REQ-1043)
-- Assumptions: STRICT tables; money stored in minor units; UTC ISO-8601 timestamps.
PRAGMA foreign_keys = ON;

CREATE TABLE products (
  id          INTEGER PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE UNIQUE INDEX customers_email_key ON customers (lower(email));

CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY,
  customer_id        INTEGER NOT NULL REFERENCES customers (id),
  status             TEXT NOT NULL CHECK (status IN ('pending','confirmed','declined','cancelled')),
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  currency           TEXT NOT NULL DEFAULT 'JPY' CHECK (length(currency) = 3),
  placed_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX orders_customer_idx ON orders (customer_id, placed_at);

CREATE TABLE order_items (
  order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products (id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  PRIMARY KEY (order_id, product_id)
) STRICT;
```

## Pitfalls

- **No exact decimal type.** Never store money in `REAL`.
- **Case sensitivity**: `UNIQUE` on TEXT is case-sensitive unless the column is
  declared `COLLATE NOCASE` or the unique index is on `lower(col)`.
- One writer at a time. Parallel test workers sharing one file hit
  `SQLITE_BUSY`; use one database file per worker, or WAL mode plus a busy timeout.
- `VARCHAR(255)` is accepted and means nothing (TEXT affinity, no limit). Use
  `TEXT` plus a `CHECK` when the limit is a real rule.
- A schema that works in SQLite may not port to the production engine. When
  SQLite is only the test database, generate the production dialect's DDL as the
  source of truth and keep this one derived from it.
