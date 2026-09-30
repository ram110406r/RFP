import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["app", "components"];
const bannedPatterns = [
  /bg-gradient/,
  /linear-gradient/,
  /radial-gradient/,
  /backdrop-blur/,
  /rounded-3xl/,
  /[Ââ]/,
  /autonomous submission/i,
  /automatic external submission/i,
];

function files(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return files(path);
    return /\.(css|tsx?)$/.test(entry) ? [path] : [];
  });
}

if (typeof Bun === "undefined") test("TENDYY UI keeps enterprise visual guardrails", () => {
  const violations = roots
    .flatMap((root) => files(root))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return bannedPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`);
    });

  expect(violations).toEqual([]);
});
