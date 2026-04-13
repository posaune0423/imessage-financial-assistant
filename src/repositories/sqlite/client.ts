import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "./schema";

export interface SqliteRepositoryContext {
  client: Client;
  db: LibSQLDatabase<typeof schema>;
}

export async function createSqliteRepositoryContext(databaseUrl: string): Promise<SqliteRepositoryContext> {
  const client = createClient({
    url: databaseUrl,
  });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await schema.ensureSqliteSchema(db);

  return {
    client,
    db,
  };
}
