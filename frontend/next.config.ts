import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [Security] Whitelist dev origins for HMR and local cross-origin development
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
