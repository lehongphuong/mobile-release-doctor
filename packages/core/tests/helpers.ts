import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll } from "vitest";
import type { Report } from "../src/findings/report.js";
import type { Finding } from "../src/findings/types.js";
import type { RuleResult } from "../src/rules-engine/engine.js";
import { scan, type ScanOptions } from "../src/scan.js";

export const REPO_ROOT = resolve(import.meta.dirname, "../../..");
export const FIXTURES = join(REPO_ROOT, "fixtures");
export const SCAN_DATE = "2026-10-14";

const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

/** Copy a fixture to a temp dir and apply overrides (string = write, null = delete). */
export function makeProject(fixture: string, overlay: Record<string, string | null> = {}, dirName = "project"): string {
  const base = mkdtempSync(join(tmpdir(), "mrd-"));
  temps.push(base);
  const root = join(base, dirName);
  if (fixture) cpSync(join(FIXTURES, fixture), root, { recursive: true });
  else mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(overlay)) {
    const abs = join(root, rel);
    if (content === null) rmSync(abs, { recursive: true, force: true });
    else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  return root;
}

export function scanProject(root: string, opts: Partial<ScanOptions> = {}): Report {
  return scan({ project: root, date: SCAN_DATE, useGit: false, scannedAt: "2026-10-14T00:00:00.000Z", ...opts });
}

export function scanFixture(fixture: string, overlay: Record<string, string | null> = {}, opts: Partial<ScanOptions> = {}): Report {
  return scanProject(makeProject(fixture, overlay), opts);
}

export function findingsOf(report: Report, ruleId: string): Finding[] {
  return report.findings.filter((f) => f.rule_id === ruleId);
}

export function resultOf(report: Report, ruleId: string): RuleResult {
  const r = report.rule_results.find((x) => x.rule_id === ruleId);
  if (!r) throw new Error(`rule ${ruleId} did not run`);
  return r;
}

/** Edit a file from a fixture: read it, transform it, return the overlay entry. */
export function edit(fixture: string, rel: string, fn: (s: string) => string): Record<string, string> {
  return { [rel]: fn(readFileSync(join(FIXTURES, fixture, rel), "utf8")) };
}

/** Build fake credentials at runtime so the repository never contains secret-shaped strings. */
export const fake = {
  awsKey: () => ["AK", "IA", "Z7Q2", "M4XN", "8PLR", "3TVW"].join(""),
  privateKeyBlock: () => ["-----BEGIN ", "PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END ", "PRIVATE KEY-----\n"].join(""),
  stripeLive: () => ["sk", "_live_", "51HxQz", "Y8bKpR2mN4vT6wC9"].join(""),
  googleApiKey: () => ["AI", "za", "SyD3", "x".repeat(31)].join(""),
};

export function plist(entries: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
${entries}
</dict>
</plist>
`;
}

export function manifest(permissions: string[], appAttrs = 'android:label="Habit Garden"'): string {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
${permissions.map((p) => `    <uses-permission android:name="${p.includes(".") ? p : `android.permission.${p}`}"/>`).join("\n")}
    <application ${appAttrs}>
        <activity android:name=".MainActivity" android:exported="true"/>
    </application>
</manifest>
`;
}
