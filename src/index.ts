import type { AST, Format, HumanReadable, Schema } from "@rocicorp/zero";
import type { Database } from "@adonisjs/lucid/database";
import type { DBConnection, DBTransaction, Row, ServerSchema } from "@rocicorp/zero/server";
import type { QueryResult as PgQueryResult } from "pg";
import type { RawQueryBindings } from "@adonisjs/lucid/types/querybuilder";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import { executePostgresQuery, ZQLDatabase } from "@rocicorp/zero/server";

export type { ZQLDatabase };

export type LucidDatabase = Database;

export type LucidClientLike<TTransaction extends TransactionClientContract = TransactionClientContract> = {
  transaction: <T>(fn: (tx: TTransaction) => Promise<T>) => Promise<T>;
};

/**
 * Helper type for the wrapped transaction used by Lucid.
 *
 * @remarks Use with `ServerTransaction` as `ServerTransaction<Schema, LucidTransaction<typeof db>>`.
 */
export type LucidTransaction<TClient extends LucidClientLike = LucidClientLike> =
  TClient extends LucidClientLike<infer TTransaction> ? TTransaction : TransactionClientContract;

export class LucidConnection<TClient extends LucidClientLike> implements DBConnection<LucidTransaction<TClient>> {
  readonly #client: TClient;

  constructor(client: TClient) {
    this.#client = client;
  }

  transaction<T>(fn: (tx: DBTransaction<LucidTransaction<TClient>>) => Promise<T>): Promise<T> {
    return this.#client.transaction((lucidTx) =>
      fn(new LucidInternalTransaction(lucidTx) as DBTransaction<LucidTransaction<TClient>>),
    );
  }
}

export class LucidInternalTransaction<TTransaction extends TransactionClientContract>
  implements DBTransaction<TTransaction>
{
  readonly wrappedTransaction: TTransaction;

  constructor(lucidTx: TTransaction) {
    this.wrappedTransaction = lucidTx;
  }

  async query(sql: string, params: unknown[]): Promise<Iterable<Row>> {
    const rawQuery = convertNumericalPlaceholdersToQuestionMarks(sql, params);

    const result = await this.wrappedTransaction
      .rawQuery<PgQueryResult<Row>>(rawQuery.sql, rawQuery.bindings as RawQueryBindings)
      .exec();

    return result.rows;
  }

  runQuery<TReturn>(
    ast: AST,
    format: Format,
    schema: Schema,
    serverSchema: ServerSchema,
  ): Promise<HumanReadable<TReturn>> {
    return executePostgresQuery<TReturn>(this, ast, format, schema, serverSchema);
  }
}

// Zero uses numerical placeholders ($1, $2, etc.) but Lucid expects question marks (?)
//
// We assume that the SQL emitted by Zero is simple enough to use regex replacements and not do complex SQL parsing
function convertNumericalPlaceholdersToQuestionMarks(
  sql: string,
  params: unknown[],
): { bindings: unknown[]; sql: string } {
  const bindings: unknown[] = [];

  const rewrittenSql = sql.replace(/\$(\d+)/g, (placeholder, indexText: string) => {
    const index = Number.parseInt(indexText, 10);

    if (index < 1 || index > params.length) {
      throw new TypeError(`Missing binding for ${placeholder}`);
    }

    bindings.push(params[index - 1]);
    return "?";
  });

  return { bindings, sql: rewrittenSql };
}

/**
 * Wrap an Adonis Lucid database instance for Zero ZQL.
 *
 * Provides ZQL querying plus access to the underlying Lucid transaction.
 * Use {@link LucidTransaction} to type your server mutator transaction.
 *
 * @param schema - Zero schema.
 * @param client - Lucid database service.
 */
export function zeroLucid<TSchema extends Schema, TClient extends LucidClientLike>(
  schema: TSchema,
  client: TClient,
): ZQLDatabase<TSchema, LucidTransaction<TClient>> {
  return new ZQLDatabase(new LucidConnection(client), schema);
}
