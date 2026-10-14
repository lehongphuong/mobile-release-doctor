import { describe, expect, it } from "vitest";
import { findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "google.account-deletion-web";
const F = "flutter/account-deletion-unknown";
const accounts = (extra = "") => ({ ".release-doctor.yml": `app:\n  has_account_creation: true\n${extra}` });

describe("positive", () => {
  it("warns when no web deletion URL is declared", () => {
    expect(findingsOf(scanFixture(F, accounts()), ID)).toEqual([expect.objectContaining({ status: "warn", title: "No web account deletion URL declared" })]);
  });

  it("warns on placeholder or non-HTTPS URLs", () => {
    const r = scanFixture(F, accounts("  account_deletion:\n    web_url: https://example.com/delete\n"));
    expect(findingsOf(r, ID)[0]!.title).toContain("placeholder");
    const r2 = scanFixture(F, accounts("  account_deletion:\n    web_url: http://tidetimer.app/delete\n"));
    expect(findingsOf(r2, ID)).toHaveLength(1);
  });
});

describe("negative", () => {
  it("passes with a real HTTPS URL", () => {
    const r = scanFixture(F, accounts("  account_deletion:\n    web_url: https://tidetimer.app/account/delete\n"));
    expect(resultOf(r, ID)).toMatchObject({ outcome: "pass", reason: expect.stringContaining("not fetched") });
  });

  it("skips for apps without accounts", () => {
    expect(resultOf(scanFixture(F, { ".release-doctor.yml": "app:\n  has_account_creation: false\n" }), ID).outcome).toBe("skip");
  });
});

describe("unknown", () => {
  it("defers to the in-app rule when account creation is unknown", () => {
    expect(resultOf(scanFixture(F), ID)).toMatchObject({ outcome: "skip", reason: expect.stringContaining("shared.account-deletion-in-app") });
  });
});
