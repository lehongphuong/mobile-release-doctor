import { describe, expect, it } from "vitest";
import { findingsOf, manifest, resultOf, scanFixture } from "../helpers.js";

const ID = "google.sensitive-permissions";
const F = "flutter/clean-project";
const M = "android/app/src/main/AndroidManifest.xml";

describe("positive", () => {
  it("warns on restricted permissions with the matching policy link", () => {
    const r = scanFixture(F, { [M]: manifest(["READ_SMS", "QUERY_ALL_PACKAGES", "FOREGROUND_SERVICE_LOCATION"]) });
    const f = findingsOf(r, ID);
    expect(f.map((x) => x.status)).toEqual(["warn", "warn", "needs_review"]);
    const sms = f.find((x) => x.title.startsWith("SMS / Call Log"))!;
    expect(sms.references.map((x) => x.id)).toEqual(["google.sms-call-log"]);
    expect(sms.evidence[0]).toMatchObject({ file: M, line: 2 });
  });

  it("reads Expo android.permissions", () => {
    const r = scanFixture("expo/clean-project", {
      "app.json": JSON.stringify({ expo: { name: "x", slug: "x", android: { package: "app.recipebox", permissions: ["ACCESS_BACKGROUND_LOCATION"] } } }),
    });
    expect(findingsOf(r, ID)[0]!.title).toContain("Background location");
  });
});

describe("negative", () => {
  it("passes when only normal permissions are requested", () => {
    expect(resultOf(scanFixture(F, { [M]: manifest(["INTERNET"]) }), ID).outcome).toBe("pass");
  });

  it("ignores permissions removed with tools:node=remove", () => {
    const xml = manifest([]).replace(
      "<application",
      '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" tools:node="remove"/>\n    <application',
    );
    expect(findingsOf(scanFixture(F, { [M]: xml }), ID)).toEqual([]);
  });
});

describe("unknown", () => {
  it("returns needs_review for Data safety disclosures instead of concluding", () => {
    const f = findingsOf(scanFixture(F, { [M]: manifest(["CAMERA"]) }), ID);
    expect(f).toEqual([expect.objectContaining({ status: "needs_review", severity: "low" })]);
  });

  it("skips when the project has no Android manifest", () => {
    expect(resultOf(scanFixture(F, { [M]: null }), ID).outcome).toBe("skip");
  });
});
