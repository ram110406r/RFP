import { loadTendyyEnv, run } from "./env-utils";

const args = process.argv.slice(2);
const env = loadTendyyEnv();

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
  throw new Error(`Unknown option: ${option}`);
}

const command = args;
if (command.length === 0) {
  console.error("Usage: bun scripts/run-with-env.ts [--node-env=value] [--app-env=value] <command> [...args]");
  process.exit(1);
}

run(command, { env }).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
