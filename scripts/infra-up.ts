import { loadTendyyEnv, requireLocal, run } from "./env-utils";

const env = loadTendyyEnv();

async function main() {
  requireLocal(env, "bun infra:up");
  const composeEnv = { ...env, COMPOSE_PROFILES: "local" };

  await run(
    [
      "docker",
      "compose",
      "-f",
      "docker-compose.yml",
      "up",
      "-d",
      "--wait",
      "postgres",
      "redis",
      "minio",
      "opensearch",
    ],
    { env: composeEnv },
  );

  await run(["docker", "compose", "-f", "docker-compose.yml", "up", "--force-recreate", "minio-init"], {
    env: composeEnv,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
