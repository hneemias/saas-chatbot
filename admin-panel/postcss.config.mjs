import path from "node:path";

const adminRoot = process.cwd().endsWith("admin-panel")
  ? process.cwd()
  : path.join(process.cwd(), "admin-panel");

const config = {
  plugins: {
    "@tailwindcss/postcss": {
      base: adminRoot,
    },
  },
};

export default config;
