import { describe, expect, it } from "vitest";
import { findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.review-access";
const F = "flutter/account-deletion-unknown";
const cfg = (s: string) => ({ ".release-doctor.yml": `app:\n${s}` });

describe("positive", () => {
  it("warns when login is required and no demo account is confirmed", () => {
    const r = scanFixture(F, cfg("  requires_login_for_review: true\n"));
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "warn", severity: "high" })]);
  });
});

describe("negative", () => {
  it("passes once the demo account is confirmed", () => {
    const r = scanFixture(F, cfg("  requires_login_for_review: true\n  review_demo_account_provided: true\n"));
    expect(resultOf(r, ID).outcome).toBe("pass");
  });

  it("skips apps without login", () => {
    expect(resultOf(scanFixture(F, cfg("  requires_login_for_review: false\n")), ID).outcome).toBe("skip");
    expect(resultOf(scanFixture(F), ID).outcome).toBe("skip");
  });
});

describe("unknown", () => {
  it("asks to confirm reviewer access when accounts are detected", () => {
    const r = scanFixture("flutter/risky-project");
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "needs_review" })]);
  });
});
