import { loadTendyyEnv, run } from "./env-utils";

type Check = {
  label: string;
  run: () => Promise<void>;
};

const env = loadTendyyEnv();

async function commandOk(command: string[]) {
  const proc = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || `${command.join(" ")} failed`);
  }
}

async function fetchOk(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
}

function requiredEnv(keys: string[]) {
  const missing = keys.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
}

const checks: Check[] = [
  { label: "Bun", run: () => commandOk(["bun", "--version"]) },
  { label: "Docker", run: () => commandOk(["docker", "version"]) },
  {
    label: "Environment",
    run: async () =>
      requiredEnv([
        "APP_ENV",
        "DATABASE_URL",
        "REDIS_URL",
        "STORAGE_ENDPOINT",
        "STORAGE_BUCKET",
        "NEXT_PUBLIC_API_URL",
        "CORS_ORIGIN",
      ]),
  },
  {
    label: "PostgreSQL",
    run: () =>
      commandOk([
        "docker",
        "compose",
        "-f",
        "docker-compose.yml",
        "exec",
        "-T",
        "postgres",
        "pg_isready",
        "-U",
        "rfpos",
        "-d",
        "rfpos",
      ]),
  },
  {
    label: "Redis",
    run: () => commandOk(["docker", "compose", "-f", "docker-compose.yml", "exec", "-T", "redis", "redis-cli", "ping"]),
  },
  { label: "MinIO", run: () => fetchOk("http://localhost:59000/minio/health/ready") },
  { label: "OpenSearch", run: () => fetchOk("http://localhost:45200/_cluster/health") },
  { label: "Database migrations", run: () => run(["bun", "scripts/run-with-env.ts", "turbo", "run", "db:migrate", "--filter=@rfp-os/db"], { env }) },
  { label: "Seed data", run: () => run(["bun", "scripts/run-with-env.ts", "turbo", "run", "db:ensure-seed", "--filter=@rfp-os/db"], { env }) },
];

console.log("TENDYY DEVELOPMENT ENVIRONMENT\n");

let failed = false;
for (const check of checks) {
  try {
    await check.run();
    console.log(`OK ${check.label}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL ${check.label}`);
    console.log(`   ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.log("\nEnvironment is not ready. Start local infrastructure with `bun infra:up`, then rerun `bun doctor`.");
  process.exit(1);
}

console.log("\nEnvironment ready.");
