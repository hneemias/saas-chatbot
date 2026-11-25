import fs from "node:fs";
import path from "node:path";

const candidateSubdir = path.join(process.cwd(), "admin-panel");
const adminRoot = fs.existsSync(path.join(candidateSubdir, "package.json"))
  ? candidateSubdir
  : process.cwd();

const config = {
  plugins: {
    "@tailwindcss/postcss": {
      base: adminRoot,
    },
  },
};

export default config;
