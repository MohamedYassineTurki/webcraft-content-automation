import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

for (const directory of ["src", "scripts", "tests", "legacy"]) {
  for (const name of await fs.readdir(directory)) {
    if (!name.endsWith(".js")) continue;
    const result = spawnSync(process.execPath, ["--check", path.join(directory, name)], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log("JavaScript syntax checks passed.");
