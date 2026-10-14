import { describe, expect, it } from "vitest";
import { edit, findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "google.target-api-level";
const F = "flutter/clean-project";
const GRADLE = "android/app/build.gradle.kts";
const withTarget = (v: string) => edit(F, GRADLE, (s) => s.replace("targetSdk = 36", `targetSdk = ${v}`));

describe("positive", () => {
  it("fails when targetSdk is below the requirement effective on the scan date", () => {
    const r = scanFixture(F, withTarget("35"));
    const [f] = findingsOf(r, ID);
    expect(f).toMatchObject({ status: "fail", severity: "error" });
    expect(f!.title).toContain("API 36");
    expect(f!.evidence[0]).toMatchObject({ file: GRADLE, value: "35" });
  });

  it("uses the requirement that was in force on an earlier date", () => {
    expect(findingsOf(scanFixture(F, withTarget("35"), { date: "2026-08-30" }), ID)).toEqual([]);
    expect(findingsOf(scanFixture(F, withTarget("34"), { date: "2026-08-30" }), ID)[0]!.title).toContain("API 35");
  });

  it("applies the Wear OS requirement for watch apps", () => {
    const r = scanFixture(F, {
      ...withTarget("35"),
      "android/app/src/main/AndroidManifest.xml": `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-feature android:name="android.hardware.type.watch"/>
  <application android:label="Habit Garden"/>
</manifest>`,
    });
    expect(findingsOf(r, ID)).toEqual([]);
  });

  it("resolves rootProject.ext values in React Native projects", () => {
    const r = scanFixture("react-native/clean-project", edit("react-native/clean-project", "android/build.gradle", (s) => s.replace("targetSdkVersion = 36", "targetSdkVersion = 33")));
    expect(findingsOf(r, ID)[0]).toMatchObject({ status: "fail", evidence: [expect.objectContaining({ file: "android/build.gradle", value: "33" })] });
  });
});

describe("negative", () => {
  it("passes a literal targetSdk that meets the requirement", () => {
    const r = scanFixture(F);
    expect(resultOf(r, ID).outcome).toBe("pass");
  });
});

describe("unknown", () => {
  it("returns needs_review for flutter.targetSdkVersion instead of guessing", () => {
    const r = scanFixture("flutter/account-deletion-unknown");
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "needs_review", title: expect.stringContaining("flutter.targetSdkVersion") })]);
  });

  it("downgrades a passing value to needs_review when the policy snapshot is stale", () => {
    const r = scanFixture(F, {}, { date: "2027-06-01" });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "needs_review", title: "Target API policy snapshot is out of date" })]);
    expect(r.catalog.policy_snapshot.stale).toBe(true);
  });

  it("still fails a value below a known requirement when the snapshot is stale", () => {
    const r = scanFixture(F, withTarget("30"), { date: "2027-06-01" });
    expect(findingsOf(r, ID)[0]!.status).toBe("fail");
  });
});
