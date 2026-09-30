import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");

if (resolve(process.cwd()) === repoRoot) {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_USER;
  delete process.env.POSTGRES_PASSWORD;
  delete process.env.POSTGRES_DB;
  delete process.env.POSTGRES_HOST;
  delete process.env.POSTGRES_PORT;
  process.env.TENDYY_ROOT_BUN_TEST = "true";
}
