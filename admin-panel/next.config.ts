import type { NextConfig } from "next";
import path from "node:path";

const adminRoot = process.cwd().endsWith("admin-panel")
  ? process.cwd()
  : path.join(process.cwd(), "admin-panel");

const nextConfig: NextConfig = {
  outputFileTracingRoot: adminRoot,
  turbopack: {
    root: adminRoot,
  },
};

export default nextConfig;
