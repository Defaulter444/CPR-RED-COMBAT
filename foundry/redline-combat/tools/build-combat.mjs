// Build the embedded combat tools: strict TypeScript from combat-src/ into combat/, plus their static assets.
import { execFileSync } from "node:child_process";
import { cp, rm, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "combat");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
execFileSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", resolve(root, "tsconfig.combat.json")], { cwd: root, stdio: "inherit" });
for (const folder of ["templates", "styles", "lang", "sounds"]) {
  await cp(resolve(root, "combat-src", folder), resolve(output, folder), { recursive: true });
}
console.log(`Built ${output}`);
