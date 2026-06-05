# zero-lucid

[Adonis Lucid](https://lucid.adonisjs.com/) database adapter for [Zero](https://zero.rocicorp.dev/) server mutators.

This package provides the interface backed by Lucid, so your Zero server mutators run through Lucid's transaction management instead of an independent connection pool. This unlocks proper test isolation: Japa (and similar test frameworks) can wrap each test in a transaction and roll it back afterward, because the mutator and the test share the same Lucid connection.

## Installation

```bash
npm install zero-lucid
```

`@rocicorp/zero` and `@adonisjs/lucid` are peer dependencies — you should already have them installed.

## Usage

Drop `zeroLucid` in wherever you configure your Zero controller:

```ts
import db from "@adonisjs/lucid/services/db";
import { zeroLucid } from "zero-lucid";
import { schema } from "./zero/schema.js";

const dbProvider = zeroLucid(schema, db);
```

Then pass `dbProvider` to `handleMutateRequest`:

```ts
import { handleMutateRequest } from "@rocicorp/zero/server";

await handleMutateRequest({
  body: request.body(),
  dbProvider,
  handler: (transact) =>
    transact((tx, name, args) => {
      const mutator = mustGetMutator(mutators, name);
      return mutator.fn({ args, ctx, tx });
    }),
  query: request.qs(),
  userID: userId,
});
```

## How it works

`zeroLucid` wraps Lucid's `db` service in a `LucidConnection` that implements Zero's `DBConnection` interface. When Zero opens a transaction, it calls `LucidConnection.transaction()`, which delegates to `db.transaction()` — so Lucid owns the connection lifecycle (BEGIN / COMMIT / ROLLBACK).

Inside the transaction, a `LucidInternalTransaction` wraps the Lucid `tx` and implements Zero's `DBTransaction` interface. It handles one non-trivial difference between the two: Zero emits PostgreSQL-style `$1, $2` parameter placeholders, but Lucid/Knex expects `?`. The adapter rewrites these before forwarding to `tx.rawQuery()`.

```
Zero calls dbProvider.transaction(fn)
  → LucidConnection opens a Lucid transaction
    → LucidInternalTransaction wraps the Lucid tx
      → your mutator runs, calling tx.run() / tx.mutate.*
        → Zero compiles ZQL to SQL
        → LucidInternalTransaction rewrites $1,$2 → ?
        → Lucid executes the SQL on the open transaction
  → Lucid commits (or rolls back on error)
```

## License

MIT
