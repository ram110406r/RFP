import type { NextConfig } from "next";

const apiTarget = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Allow a clean local runtime to use isolated generated artifacts when a
  // stale Windows process cannot release the default .next directory.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
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
