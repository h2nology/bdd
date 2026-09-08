# MySQL / MariaDB DDL

Target MySQL 8.0+ (or MariaDB 10.6+). Note the differences where they matter.

## Type mapping

| Logical type | MySQL | Notes |
|---|---|---|
| short text | `VARCHAR(n)` | InnoDB index prefix limit: 3072 bytes with DYNAMIC row format |
| long text | `TEXT` / `MEDIUMTEXT` | Cannot have a default; needs a prefix length to index |
| integer | `INT` | |
| big integer | `BIGINT` | Default for surrogate keys |
| decimal / money | `DECIMAL(12,2)` | Never `FLOAT`/`DOUBLE` |
| boolean | `BOOLEAN` | An alias for `TINYINT(1)`; stored as 0/1 |
| date | `DATE` | |
| timestamp | `DATETIME(6)` or `TIMESTAMP` | See the timezone note below |
| time | `TIME` | |
| uuid | `BINARY(16)` or `CHAR(36)` | `BINARY(16)` with `UUID_TO_BIN(uuid, 1)` is compact and index-friendly |
| json | `JSON` | Validated; index a generated column, not the JSON directly |
| enum | `ENUM('a','b')` or `CHECK` | Native enum is stored as an integer |
| binary | `BLOB` / `VARBINARY(n)` | |

## Identity

```sql
id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
```

`UNSIGNED` doubles the range but breaks ORMs that map to signed types - decide
once, project-wide. MySQL allows one auto-increment column per table.

## Timezone: the one that bites

- `TIMESTAMP` converts to UTC on write and back to the session timezone on read,
  and is limited to 2038.
- `DATETIME` stores exactly what it is given, with no conversion.

Pick `DATETIME(6)` and store UTC explicitly (set `time_zone = '+00:00'` on the
application connection), or use `TIMESTAMP` deliberately for auto-conversion.
Whichever you choose, write it in the migration comment.

## Timestamps

MySQL has native auto-update, unlike PostgreSQL:

```sql
created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
```

## Charset and collation

Always be explicit; older servers still default to `latin1`:

```sql
CREATE TABLE ... ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- `utf8mb4` is the only charset that stores the full Unicode range (emoji
  included). Plain `utf8` is a 3-byte subset - never use it.
- `utf8mb4_0900_ai_ci` is accent- and case-insensitive: `'Alice@x.com'` and
  `'alice@x.com'` collide in a UNIQUE index. That is usually what an email
  uniqueness rule wants, but state it. Use `utf8mb4_0900_as_cs` for
  case-sensitive columns (tokens, codes).
- MariaDB uses `utf8mb4_uca1400_ai_ci` or `utf8mb4_unicode_ci` instead.

## Constraints and indexes

```sql
CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT,
CONSTRAINT orders_total_positive CHECK (total_amount >= 0)
```

- `CHECK` is enforced from MySQL 8.0.16; earlier versions parse and ignore it.
  Verify the server version before relying on it.
- No partial (filtered) indexes. Soft deletion plus uniqueness therefore needs a
  generated column:

```sql
deleted_at DATETIME(6) NULL,
email_active VARCHAR(255) GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) STORED,
UNIQUE KEY customers_email_active_key (email_active)
```

- Prefix indexes for long text: `KEY products_name_idx (name(64))`.
- Foreign keys require the same type and collation on both sides; a mismatch
  gives the notoriously unhelpful `errno: 150`.

## Identifiers

- Case sensitivity of table names follows the file system unless
  `lower_case_table_names` is set: the same schema behaves differently on macOS
  and Linux. Use lower_snake_case always.
- 64-character limit.
- Reserved words: `order`, `group`, `rank`, `system`, `key`, `lead`, `window`.
  Plural table names avoid most of them.

## Canonical example

```sql
-- Derived from features/checkout.feature (REQ-1042, REQ-1043)
-- Assumptions: surrogate BIGINT keys; UTC stored in DATETIME(6); single currency per order.
CREATE TABLE products (
  id         BIGINT NOT NULL AUTO_INCREMENT,
  sku        VARCHAR(32)  NOT NULL,
  name       VARCHAR(255) NOT NULL,
  price      DECIMAL(12,2) NOT NULL,
  created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY products_sku_key (sku),
  CONSTRAINT products_price_positive CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE customers (
  id         BIGINT NOT NULL AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL,
  created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY customers_email_key (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders (
  id           BIGINT NOT NULL AUTO_INCREMENT,
  customer_id  BIGINT NOT NULL,
  status       ENUM('pending','confirmed','declined','cancelled') NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  currency     CHAR(3)     NOT NULL DEFAULT 'JPY',
  placed_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY orders_customer_idx (customer_id, placed_at),
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE order_items (
  order_id   BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity   INT    NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (order_id, product_id),
  KEY order_items_product_idx (product_id),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_order_fk   FOREIGN KEY (order_id)   REFERENCES orders (id)   ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## Pitfalls

- **DDL is not transactional.** A failed migration leaves the schema half
  changed. Keep migrations small, one logical change each, and test the reverse
  script on a copy before running it anywhere shared.
- Appending a value to an `ENUM` is cheap in 8.0; reordering or removing values
  rewrites the table. Append only.
- `VARCHAR(255)` in `utf8mb4` is 1020 bytes: a composite unique key over several
  such columns can exceed the index limit.
- MariaDB is not MySQL for JSON (`JSON` is an alias for `LONGTEXT`) or for some
  window functions. If the project uses MariaDB, say which features you avoided.
