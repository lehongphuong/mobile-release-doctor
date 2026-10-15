import { describe, expect, it } from "vitest";
import { findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.privacy-policy";
const F = "flutter/clean-project";

describe("positive", () => {
  it("warns on a placeholder policy URL", () => {
    const r = scanFixture(F, { ".release-doctor.yml": "app:\n  has_account_creation: false\n  privacy_policy_url: https://example.com/privacy\n" });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "warn", severity: "high" })]);
  });

  it("warns when a local policy does not mention a data-collecting SDK", () => {
    const r = scanFixture("flutter/risky-project");
    expect(findingsOf(r, ID).map((f) => f.title)).toContain("Privacy policy may not cover Google Analytics for Firebase");
  });
});

describe("negative", () => {
  it("passes when a real policy URL is declared and no data SDKs are present", () => {
    expect(resultOf(scanFixture(F), ID).outcome).toBe("pass");
  });

  it("accepts a policy document that mentions the SDK", () => {
    const r = scanFixture("flutter/risky-project", {
      ".release-doctor.yml": "app:\n  privacy_policy_url: https://healthtracker.app/privacy\n",
      "privacy-policy.md": "# Privacy\nWe use Google Analytics for Firebase to understand feature usage.\n",
    });
    expect(findingsOf(r, ID)).toEqual([]);
  });
});

describe("unknown", () => {
  it("returns needs_review when no policy can be found in the project", () => {
    const r = scanFixture(F, { ".release-doctor.yml": "app:\n  has_account_creation: false\n" });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "needs_review", title: "No privacy policy found in the project" })]);
  });

  it("asks to verify SDK disclosures when the policy text is not in the repo", () => {
    const r = scanFixture("flutter/risky-project", { "privacy-policy.md": null, ".release-doctor.yml": "app:\n  privacy_policy_url: https://healthtracker.app/privacy\n" });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "needs_review", title: "Verify privacy disclosures for data-collecting SDKs" })]);
  });
});
