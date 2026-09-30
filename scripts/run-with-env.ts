import { loadTendyyEnv, run } from "./env-utils";
import { connect } from "node:net";

const args = process.argv.slice(2);
const env = loadTendyyEnv();
let requireDatabase = false;

while (args[0]?.startsWith("--")) {
  const option = args.shift();
  if (option?.startsWith("--node-env=")) {
    env.NODE_ENV = option.slice("--node-env=".length);
    continue;
  }
  if (option?.startsWith("--app-env=")) {
    env.APP_ENV = option.slice("--app-env=".length);
    continue;
  }
  if (option === "--without-database") {
    delete env.DATABASE_URL;
    delete env.POSTGRES_HOST;
    delete env.POSTGRES_PORT;
    delete env.POSTGRES_USER;
    delete env.POSTGRES_PASSWORD;
    delete env.POSTGRES_DB;
    continue;
  }
  if (option === "--require-database") {
    requireDatabase = true;
    continue;
  }
  throw new Error(`Unknown option: ${option}`);
}

const command = args;
if (command.length === 0) {
  console.error("Usage: bun scripts/run-with-env.ts [--node-env=value] [--app-env=value] [--without-database] <command> [...args]");
  process.exit(1);
}

try {
  if (requireDatabase) {
    await assertDatabaseReachable(env);
  }
  await run(command, { env });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function assertDatabaseReachable(env: NodeJS.ProcessEnv) {
  const target = resolveDatabaseTarget(env);
  if (!target) {
    throw new Error(
      "test:db requires DATABASE_URL or POSTGRES_HOST/POSTGRES_PORT. Run `bun infra:up`, then `bun db:migrate` and `bun db:ensure-seed`.",
    );
  }

  try {
    await canConnect(target);
  } catch {
    throw new Error(
      `test:db requires a reachable Postgres at ${target.host}:${target.port}. Run \`bun infra:up\`, then \`bun db:migrate\` and \`bun db:ensure-seed\`.`,
    );
  }
}

function resolveDatabaseTarget(env: NodeJS.ProcessEnv) {
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      return {
        host: url.hostname || "localhost",
        port: Number(url.port || 5432),
      };
    } catch {
      return null;
    }
  }

  if (env.POSTGRES_HOST) {
    return {
      host: env.POSTGRES_HOST,
      port: Number(env.POSTGRES_PORT || 5432),
    };
  }

  return null;
}

async function canConnect(target: { host: string; port: number }) {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: target.host, port: target.port });
    socket.setTimeout(1_500);
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.once("error", reject);
  });
}
