import { loadTendyyEnv, requireLocal, run } from "./env-utils";

const env = loadTendyyEnv();

async function main() {
  requireLocal(env, "bun infra:up");

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
    { env },
  );

  await run(["docker", "compose", "-f", "docker-compose.yml", "up", "--force-recreate", "minio-init"], {
    env,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
