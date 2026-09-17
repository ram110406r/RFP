import { loadTendyyEnv, requireLocal, run } from "./env-utils";

const env = loadTendyyEnv();

async function main() {
  requireLocal(env, "bun dev");

  console.log("Starting TENDYY local development environment...\n");
  await run(["bun", "scripts/infra-up.ts"], { env });
  console.log("\nInfrastructure ready.");

  await run(["bun", "scripts/run-with-env.ts", "turbo", "run", "db:migrate", "--filter=@rfp-os/db"], { env });
  await run(["bun", "scripts/run-with-env.ts", "turbo", "run", "db:ensure-seed", "--filter=@rfp-os/db"], { env });

  console.log("\nStarting API, worker, and web with hot reload...\n");
  await run(
    [
      "bun",
      "scripts/run-with-env.ts",
      "turbo",
      "run",
      "dev",
      "--filter=@rfp-os/api",
      "--filter=@rfp-os/worker",
      "--filter=@rfp-os/web",
    ],
    { env },
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
