import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const configuredApiTarget =
  process.env.API_INTERNAL_URL ?? process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
if (process.env.NODE_ENV === "production" && !configuredApiTarget) {
  throw new Error("API_INTERNAL_URL is required in production.");
}
const apiTarget = (configuredApiTarget ?? "http://127.0.0.1:4100").replace(/\/$/, "");
const configRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Allow a clean local runtime to use isolated generated artifacts when a
  // stale Windows process cannot release the default .next directory.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  output: "standalone",
  outputFileTracingRoot: join(configRoot, "../.."),
  transpilePackages: ["@rfp-os/ui", "@rfp-os/types", "@rfp-os/validation"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
