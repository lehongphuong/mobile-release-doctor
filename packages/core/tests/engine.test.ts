import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectContext } from "../src/analyzer/project.js";
import { detectFramework } from "../src/analyzer/detect.js";
import { checkRegistry } from "../src/rules/index.js";
import { runRules } from "../src/rules-engine/engine.js";
import { loadCatalog } from "../src/rules-engine/loader.js";
import type { RuleCheck } from "../src/rules-engine/types.js";
import { findingSchema } from "../src/findings/types.js";
import { FIXTURES, findingsOf, makeProject, REPO_ROOT, scanFixture, scanProject } from "./helpers.js";

function hashTree(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}

function context(root: string) {
  return new ProjectContext({ root, detection: detectFramework(root)!, now: new Date("2026-10-14T00:00:00Z"), useGit: false });
}

describe("catalog", () => {
  it("every rule has metadata, an implementation and positive/negative/unknown tests", () => {
    const catalog = loadCatalog();
    const checks = checkRegistry();
    expect(catalog.rules.length).toBeGreaterThanOrEqual(10);
    expect([...checks.keys()].sort()).toEqual(catalog.rules.map((r) => r.meta.id).sort());
    for (const r of catalog.rules) {
      const testFile = join(REPO_ROOT, "packages/core/tests/rules", `${r.meta.id}.test.ts`);
      const src = readFileSync(testFile, "utf8");
      for (const kind of ["positive", "negative", "unknown"]) expect(src, `${r.meta.id} needs a ${kind} test`).toContain(`describe("${kind}"`);
      expect(r.references.length).toBeGreaterThan(0);
    }
  });

  it("every rule has documentation in the rule catalog reference", () => {
    const doc = readFileSync(join(REPO_ROOT, "skills/mobile-release-doctor/references/rule-catalog.md"), "utf8");
    for (const r of loadCatalog().rules) expect(doc, `${r.meta.id} missing from rule-catalog.md`).toContain(`\`${r.meta.id}\``);
  });
});

describe("engine contract", () => {
  const catalog = loadCatalog();
  const root = join(FIXTURES, "flutter/clean-project");

  it("rejects findings with a status the rule does not allow", () => {
    const bad: RuleCheck = { id: "shared.permission-usage-evidence", run: () => ({ findings: [{ status: "fail", explanation: "x", evidence: [] }] }) };
    const checks = checkRegistry().set(bad.id, bad);
    const res = runRules(catalog, checks, context(root), { platform: "all" });
    expect(res.ruleResults.find((r) => r.rule_id === bad.id)).toMatchObject({ outcome: "error", reason: expect.stringContaining('status "fail"') });
    expect(res.findings.filter((f) => f.rule_id === bad.id)).toEqual([]);
  });

  it("rejects findings more severe than max_severity", () => {
    const bad: RuleCheck = { id: "shared.permission-usage-evidence", run: () => ({ findings: [{ status: "needs_review", severity: "error", explanation: "x", evidence: [] }] }) };
    const res = runRules(catalog, checkRegistry().set(bad.id, bad), context(root), { platform: "all" });
    expect(res.ruleResults.find((r) => r.rule_id === bad.id)!.outcome).toBe("error");
  });

  it("isolates a crashing rule", () => {
    const boom: RuleCheck = { id: "shared.app-identifier", run: () => { throw new Error("boom"); } };
    const res = runRules(catalog, checkRegistry().set(boom.id, boom), context(root), { platform: "all" });
    expect(res.ruleResults.find((r) => r.rule_id === boom.id)).toMatchObject({ outcome: "error", reason: "boom" });
    expect(res.ruleResults.filter((r) => r.outcome === "pass").length).toBeGreaterThan(5);
  });

  it("every finding validates against the schema", () => {
    for (const f of scanFixture("flutter/risky-project").findings) expect(findingSchema.safeParse(f).success).toBe(true);
  });
});

describe("scan behaviour", () => {
  it("is deterministic for the same input and rule version", () => {
    const root = makeProject("flutter/risky-project");
    expect(JSON.stringify(scanProject(root))).toBe(JSON.stringify(scanProject(root)));
  });

  it("is read-only", () => {
    const root = makeProject("flutter/risky-project");
    const before = hashTree(root);
    scanProject(root);
    expect(hashTree(root)).toBe(before);
  });

  it("filters by platform", () => {
    const r = scanFixture("flutter/risky-project", {}, { platform: "ios" });
    expect(r.findings.every((f) => f.platform === "ios" || f.platform === "all")).toBe(true);
    expect(r.rule_results.some((x) => x.rule_id === "google.target-api-level")).toBe(false);
  });

  it("runs only selected rules", () => {
    const r = scanFixture("flutter/risky-project", {}, { rules: ["shared.app-identifier"] });
    expect(r.rule_results.map((x) => x.rule_id)).toEqual(["shared.app-identifier"]);
  });

  it("suppresses findings listed in config ignores, with the reason", () => {
    const r = scanFixture("flutter/risky-project", {
      ".release-doctor.yml": "app:\n  privacy_policy_url: https://healthtracker.app/privacy\nignore:\n  - rule: shared.embedded-secrets\n    path: lib/config.dart\n    reason: Public identifier for the demo backend\n",
    });
    expect(findingsOf(r, "shared.embedded-secrets").some((f) => f.evidence.some((e) => e.file === "lib/config.dart"))).toBe(false);
    expect(r.suppressed).toEqual([expect.objectContaining({ rule_id: "shared.embedded-secrets", reason: "Public identifier for the demo backend" })]);
  });

  it("hides findings below --severity but still counts them", () => {
    const r = scanFixture("flutter/risky-project", {}, { minSeverity: "high" });
    expect(r.findings.every((f) => ["error", "high"].includes(f.severity))).toBe(true);
    expect(r.summary.hidden_below_severity).toBeGreaterThan(0);
  });

  it("compares with a baseline to show resolved and new findings", () => {
    const root = makeProject("flutter/risky-project");
    const before = scanProject(root);
    const fixed = makeProject("flutter/risky-project", {
      "android/app/build.gradle": readFileSync(join(root, "android/app/build.gradle"), "utf8").replace("targetSdkVersion 34", "targetSdkVersion 36"),
    });
    const after = scanProject(fixed, { baseline: before });
    expect(after.comparison!.resolved.map((x) => x.rule_id)).toEqual(["google.target-api-level"]);
    expect(after.comparison!.new).toEqual([]);
    expect(after.comparison!.unchanged).toBe(before.findings.length - 1);
  });

  it("never reports a score and always carries the disclaimer", () => {
    const r = scanFixture("flutter/clean-project");
    expect(JSON.stringify(r)).not.toMatch(/"score"/);
    expect(r.disclaimer).toMatch(/cannot guarantee/);
    expect(r.summary.readiness).toBe("no-issues-detected");
  });

  it("evaluates the threshold only from fail/warn findings", () => {
    expect(scanFixture("flutter/risky-project").summary.threshold_exceeded).toBe(true);
    expect(scanFixture("flutter/account-deletion-unknown").summary.threshold_exceeded).toBe(false);
  });

  it("handles paths with spaces and Unicode", () => {
    const root = makeProject("flutter/risky-project", {}, "my app ứng dụng");
    const r = scanProject(root);
    expect(r.summary.by_status.fail).toBe(scanFixture("flutter/risky-project").summary.by_status.fail);
  });

  it("rejects an invalid config file with a clear message", () => {
    expect(() => scanFixture("flutter/clean-project", { ".release-doctor.yml": "fail_on: catastrophic\n" })).toThrow(/fail_on/);
  });
});
