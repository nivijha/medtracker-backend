import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const skip = new Set(["node_modules", ".git", "uploads", "coverage", ".next", "build"]);

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (skip.has(entry)) continue;

    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
    } else if (extname(full) === ".js") {
      try {
        execSync(`node --check "${full}"`, { stdio: "pipe" });
      } catch {
        console.error(`SYNTAX FAIL: ${full}`);
        process.exitCode = 1;
      }
    }
  }
};

walk(root);

if (!process.exitCode) {
  console.log("Syntax check passed.");
}
