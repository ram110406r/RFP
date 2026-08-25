import postgres from "postgres";

import { resolveDatabaseUrl } from "./src/client";

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  throw new Error("no database url");
}

const client = postgres(databaseUrl);

try {
  await client.unsafe('create schema if not exists "drizzle"');
  console.log("create schema ok");
} catch (error) {
  console.error(error);
  if (error instanceof Error) {
    console.error(`message: ${error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyError = error as any;
    console.error(`code: ${anyError.code ?? "n/a"}`);
    console.error(`severity: ${anyError.severity ?? "n/a"}`);
  }
} finally {
  await client.end();
}
