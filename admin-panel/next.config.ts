import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const candidateSubdir = path.join(process.cwd(), "admin-panel");
const adminRoot = fs.existsSync(path.join(candidateSubdir, "package.json"))
  ? candidateSubdir
  : process.cwd();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: adminRoot,
  turbopack: {
    root: adminRoot,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
