import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rfp-os/ui", "@rfp-os/types", "@rfp-os/validation"],
};

export default nextConfig;
