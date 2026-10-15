import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES, REPO_ROOT, SCAN_DATE } from "./helpers.js";

const BUNDLE = join(REPO_ROOT, "skills/mobile-release-doctor/scripts/scan.mjs");

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [BUNDLE, "--no-git", "--date", SCAN_DATE, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("bundled CLI (what the skill runs)", () => {
  it("exits 0 on a completed scan, even with findings", () => {
    const r = run("--project", join(FIXTURES, "flutter/risky-project"));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("FAIL");
  });

  it("exits 1 with --strict when the threshold is exceeded", () => {
    expect(run("--project", join(FIXTURES, "flutter/risky-project"), "--strict").code).toBe(1);
    expect(run("--project", join(FIXTURES, "flutter/clean-project"), "--strict").code).toBe(0);
    expect(run("--project", join(FIXTURES, "flutter/account-deletion-unknown"), "--strict", "--fail-on", "low").code).toBe(0);
  });

  it("exits 2 on invalid arguments, unknown rules and unsupported projects", () => {
    expect(run("--format", "pdf").code).toBe(2);
    expect(run("--project", join(FIXTURES, "flutter/clean-project"), "--rules", "apple.nope").code).toBe(2);
    expect(run("--bogus").code).toBe(2);
    const empty = mkdtempSync(join(tmpdir(), "mrd-empty-"));
    const r = run("--project", empty);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("No supported mobile project");
  });

  it("exits 4 when the requested platform is missing", () => {
    expect(run("--project", join(FIXTURES, "native-android/clean-project"), "--platform", "ios").code).toBe(4);
  });

  it("writes JSON and Markdown reports to files", () => {
    const dir = mkdtempSync(join(tmpdir(), "mrd-out-"));
    const json = join(dir, "nested", "report.json");
    const md = join(dir, "report.md");
    expect(run("--project", join(FIXTURES, "flutter/risky-project"), "--format", "markdown", "--output", md, "--json-output", json).code).toBe(0);
    const report = JSON.parse(readFileSync(json, "utf8"));
    expect(report.schema_version).toBe("1.0");
    expect(readFileSync(md, "utf8")).toContain("## Findings");
  });

  it("validates the rule catalog", () => {
    const r = spawnSync(process.execPath, [BUNDLE, "--validate-rules"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^OK: \d+ rules/);
  });

  it("prints help with exit codes", () => {
    expect(run("--help").stdout).toContain("Exit codes");
  });
});
