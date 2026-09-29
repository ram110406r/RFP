import { loadTendyyEnv, requireLocal, run } from "./env-utils";

const env = loadTendyyEnv();

async function main() {
  requireLocal(env, "bun infra:down");
  await run(["docker", "compose", "-f", "docker-compose.yml", "down"], {
    env: { ...env, COMPOSE_PROFILES: "local" },
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
