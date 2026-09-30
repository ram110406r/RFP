import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const configuredApiTarget =
  process.env.API_INTERNAL_URL ?? process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
if (!configuredApiTarget) {
  throw new Error("TENDYY web configuration error: API_INTERNAL_URL or NEXT_PUBLIC_API_URL is required.");
}
const apiTarget = configuredApiTarget.replace(/\/$/, "");
const storageTarget = (process.env.MINIO_INTERNAL_URL ?? process.env.STORAGE_ENDPOINT ?? "http://minio:9000").replace(/\/$/, "");
const storageBucket = process.env.STORAGE_BUCKET ?? "rfp-os-documents";
const configRoot = dirname(fileURLToPath(import.meta.url));
const standaloneOutput = process.env.NEXT_OUTPUT_STANDALONE !== "false";

const nextConfig: NextConfig = {
  // Allow a clean local runtime to use isolated generated artifacts when a
  // stale Windows process cannot release the default .next directory.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  output: standaloneOutput ? "standalone" : undefined,
  outputFileTracingRoot: join(configRoot, "../.."),
  transpilePackages: ["@rfp-os/ui", "@rfp-os/types", "@rfp-os/validation"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiTarget}/api/v1/:path*`,
      },
      {
        source: "/api/auth/:path*",
        destination: `${apiTarget}/api/auth/:path*`,
      },
      {
        source: `/${storageBucket}/:path*`,
        destination: `${storageTarget}/${storageBucket}/:path*`,
      },
    ];
  },
};

export default nextConfig;
