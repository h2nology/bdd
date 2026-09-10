# SQL Server DDL

Target SQL Server 2019+ / Azure SQL.

## Type mapping

| Logical type | SQL Server | Notes |
|---|---|---|
| short text | `NVARCHAR(n)` | `N` prefix = Unicode. Use `VARCHAR` only for pure ASCII codes |
| long text | `NVARCHAR(MAX)` | Never `NTEXT` (deprecated) |
| integer | `INT` | |
| big integer | `BIGINT` | Default for surrogate keys |
| decimal / money | `DECIMAL(12,2)` | Never the `MONEY` type: 4 decimal places and rounding surprises |
| boolean | `BIT` | 0/1/NULL |
| date | `DATE` | |
| timestamp | `DATETIME2(3)` or `DATETIMEOFFSET(3)` | Use `DATETIMEOFFSET` when the offset matters. Never `DATETIME` (3.33 ms precision) and never `TIMESTAMP` (that is a row version, not a time) |
| time | `TIME(0)` | |
| uuid | `UNIQUEIDENTIFIER` | `NEWSEQUENTIALID()` as a column default avoids index fragmentation; `NEWID()` in application code |
| json | `NVARCHAR(MAX)` + `CHECK (ISJSON(col) = 1)` | A native `JSON` type exists only in Azure SQL / SQL Server 2025 |
| enum | `CHECK (col IN (...))` | No native enum |
| binary | `VARBINARY(MAX)` | |

## Identity

```sql
id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY
```

Use a `SEQUENCE` when ids must be shared across tables or fetched before insert.

## Timestamps

```sql
created_at DATETIME2(3) NOT NULL CONSTRAINT products_created_df DEFAULT SYSUTCDATETIME(),
updated_at DATETIME2(3) NOT NULL CONSTRAINT products_updated_df DEFAULT SYSUTCDATETIME()
```

- `SYSUTCDATETIME()` for UTC; `SYSDATETIME()` returns server local time - pick
  UTC unless the project already does otherwise.
- No auto-update: use a trigger, or a temporal table when history is wanted:

```sql
-- System-versioned temporal table: SQL Server keeps the full history for you
CREATE TABLE orders (
  ...,
  valid_from DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL,
  valid_to   DATETIME2 GENERATED ALWAYS AS ROW END   NOT NULL,
  PERIOD FOR SYSTEM_TIME (valid_from, valid_to)
) WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.orders_history));
```

When the scenarios talk about audit history, offer this instead of a hand-rolled
history table.

## Constraints and indexes

```sql
CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE NO ACTION,
CONSTRAINT orders_status_ck   CHECK (status IN ('pending','confirmed','declined','cancelled'))
```

- `NO ACTION` is the equivalent of RESTRICT and is the default.
- **Multiple cascade paths are rejected**: when two FK paths can reach the same
  table with cascading removal, `CREATE TABLE` fails with "may cause cycles or
  multiple cascade paths". Handle it in application code or a trigger, and say so.
- Filtered indexes give the soft-deletion pattern directly:

```sql
CREATE UNIQUE INDEX customers_email_active_key ON customers (email) WHERE deleted_at IS NULL;
```

- Collation controls case sensitivity. The common default
  `SQL_Latin1_General_CP1_CI_AS` is case-**insensitive**, so `'Alice@x.com'`
  collides with `'alice@x.com'` in a unique index. State whether that matches
  the requirement, and set the column collation explicitly when it does not:
  `email NVARCHAR(255) COLLATE Latin1_General_100_CS_AS NOT NULL`.

## Identifiers

- Case-insensitive by default (collation-dependent); use snake_case or PascalCase
  consistently with the existing schema.
- 128 characters.
- Reserved words: `user`, `order`, `key`, `check`, `plan`, `percent`, `identity`.
  Bracket-quoting (`[order]`) is possible but a smell - rename instead.

## Canonical example

```sql
-- Derived from features/checkout.feature (REQ-1042, REQ-1043)
-- Assumptions: BIGINT IDENTITY keys; UTC timestamps; single currency per order.
CREATE TABLE products (
  id         BIGINT IDENTITY(1,1) NOT NULL,
  sku        NVARCHAR(32)  NOT NULL,
  name       NVARCHAR(255) NOT NULL,
  price      DECIMAL(12,2) NOT NULL,
  created_at DATETIME2(3)  NOT NULL CONSTRAINT products_created_df DEFAULT SYSUTCDATETIME(),
  CONSTRAINT products_pk       PRIMARY KEY (id),
  CONSTRAINT products_sku_key  UNIQUE (sku),
  CONSTRAINT products_price_ck CHECK (price >= 0)
);

CREATE TABLE customers (
  id         BIGINT IDENTITY(1,1) NOT NULL,
  email      NVARCHAR(255) NOT NULL,
  created_at DATETIME2(3)  NOT NULL CONSTRAINT customers_created_df DEFAULT SYSUTCDATETIME(),
  CONSTRAINT customers_pk        PRIMARY KEY (id),
  CONSTRAINT customers_email_key UNIQUE (email)
);

CREATE TABLE orders (
  id           BIGINT IDENTITY(1,1) NOT NULL,
  customer_id  BIGINT        NOT NULL,
  status       NVARCHAR(16)  NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  currency     CHAR(3)       NOT NULL CONSTRAINT orders_currency_df DEFAULT 'JPY',
  placed_at    DATETIME2(3)  NOT NULL CONSTRAINT orders_placed_df DEFAULT SYSUTCDATETIME(),
  CONSTRAINT orders_pk          PRIMARY KEY (id),
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT orders_status_ck   CHECK (status IN ('pending','confirmed','declined','cancelled')),
  CONSTRAINT orders_total_ck    CHECK (total_amount >= 0)
);
CREATE INDEX orders_customer_idx ON orders (customer_id, placed_at);

CREATE TABLE order_items (
  order_id   BIGINT        NOT NULL,
  product_id BIGINT        NOT NULL,
  quantity   INT           NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  CONSTRAINT order_items_pk         PRIMARY KEY (order_id, product_id),
  CONSTRAINT order_items_order_fk   FOREIGN KEY (order_id)   REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT order_items_qty_ck     CHECK (quantity > 0)
);
```

## Pitfalls

- **`TIMESTAMP`/`ROWVERSION` is not a time.** It is an incrementing binary row
  version. Use `DATETIME2` or `DATETIMEOFFSET`.
- **`MONEY` is a trap** - fixed 4 decimals and lossy intermediate rounding.
- The clustered index defaults to the primary key; a UUID primary key then
  fragments the table. Either use `NEWSEQUENTIALID()` or cluster on an identity
  column and keep the UUID as a unique index.
- DDL **is** transactional here, so wrap migrations in
  `BEGIN TRANSACTION` / `COMMIT` - one of the few engines where a failed
  migration rolls back cleanly.
- `NVARCHAR(MAX)` columns cannot be index keys; index a computed hash or a
  truncated prefix column instead.

## Optimistic locking

SQL Server has the best native support of the five: `ROWVERSION` is maintained by
the engine, unique within the database, and cannot be written by the application.

```sql
ALTER TABLE orders ADD row_version ROWVERSION;   -- no NOT NULL, no DEFAULT: the engine owns it

UPDATE orders SET status = 'confirmed'
WHERE id = @id AND row_version = @rowVersion;
IF @@ROWCOUNT = 0 -- somebody else committed first
```

Two cautions, one of them already noted in the pitfalls above:

- `ROWVERSION` is **not a timestamp**. It carries no time, and the deprecated
  `TIMESTAMP` spelling means the same thing - never use either as an audit column.
- It changes on *every* update, including one that writes the same values back. A
  no-op save still bumps it and will conflict with a concurrent editor.

EF Core maps it with `.IsRowVersion()`. If the project is ORM-free or needs a
value it can serialize into an API, an explicit `BIGINT` counter travels better.
