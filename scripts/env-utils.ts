import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const envFiles = [".env.example", ".env", ".env.local"] as const;

export function loadTendyyEnv() {
  const root = findRepoRoot(process.cwd());
  const env: Record<string, string> = {};
  for (const file of envFiles) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    Object.assign(env, parseEnvFile(readFileSync(path, "utf8")));
  }
  return { ...env, ...process.env } as NodeJS.ProcessEnv;
}

export function findRepoRoot(start: string) {
  let current = resolve(start);
  while (true) {
    const packageJson = resolve(current, "package.json");
    if (existsSync(packageJson)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJson, "utf8")) as { name?: string; workspaces?: unknown };
        if (parsed.name === "rfp-os" && parsed.workspaces) return current;
      } catch {
        // Keep walking.
      }
    }
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

export function parseEnvFile(source: string) {
  const env: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export async function run(command: string[], options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) {
  const proc = Bun.spawn(command, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? loadTendyyEnv(),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  }
}

export function requireLocal(env: NodeJS.ProcessEnv, commandName: string) {
  const appEnv = env.APP_ENV ?? "local";
  if (appEnv !== "local") {
    throw new Error(`${commandName} is local-only. Refusing to run with APP_ENV=${appEnv}.`);
  }
}
