#!/usr/bin/env node
// Maintainer tool: checks that every policy source URL still resolves.
// This is the only script that uses the network, and it never sends project data.
// Usage: node validate-policy-sources.mjs [--timeout 20000]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "policy", "sources.yaml"), "utf8");
const timeout = Number(process.argv[process.argv.indexOf("--timeout") + 1]) || 20000;

// sources.yaml is simple enough to read without a YAML dependency.
const sources = [...text.matchAll(/- id: (\S+)[\s\S]*?url: (\S+)[\s\S]*?last_checked: (\S+)/g)].map((m) => ({ id: m[1], url: m[2], last_checked: m[3] }));

let failed = 0;
for (const s of sources) {
  const url = s.url.split("#")[0];
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(timeout), headers: { "user-agent": "mobile-release-doctor-policy-check" } });
    const ok = res.status < 400;
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "FAIL"} ${res.status} ${s.id} ${url}${s.last_checked === "null" ? " (never re-read; update last_checked after reviewing)" : ""}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ---- ${s.id} ${url} (${e.cause?.code ?? e.message})`);
  }
}
console.log(`\n${sources.length - failed}/${sources.length} sources reachable. Reachability does not prove the cited requirement is unchanged; re-read each page before bumping last_checked.`);
process.exitCode = failed ? 1 : 0;
