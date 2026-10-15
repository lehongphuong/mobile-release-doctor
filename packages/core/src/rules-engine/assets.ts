import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the skill directory that holds rules/ and policy/.
 * Works from the TypeScript sources (tests) and from the bundled scripts/scan.mjs.
 */
export function resolveSkillDir(): string {
  const fromEnv = process.env["MRD_SKILL_DIR"];
  if (fromEnv) return resolve(fromEnv);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "SKILL.md")) && existsSync(join(dir, "rules"))) return dir;
    const nested = join(dir, "skills", "mobile-release-doctor");
    if (existsSync(join(nested, "SKILL.md"))) return nested;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate the mobile-release-doctor skill directory (rules/ and policy/). Set MRD_SKILL_DIR.");
}
