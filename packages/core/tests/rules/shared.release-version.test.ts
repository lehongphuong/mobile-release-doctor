import { describe, expect, it } from "vitest";
import { edit, findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.release-version";
const F = "flutter/clean-project";
const version = (v: string) => edit(F, "pubspec.yaml", (s) => s.replace("version: 1.2.0+12", v));

describe("positive", () => {
  it("fails a pre-release suffix that App Store Connect rejects", () => {
    const [f] = findingsOf(scanFixture(F, version("version: 1.2.0-rc.1+12")), ID);
    expect(f).toMatchObject({ status: "fail", severity: "error", platform: "ios" });
    expect(f!.evidence[0]).toMatchObject({ file: "pubspec.yaml", line: 4 });
  });

  it("fails a non-numeric build number", () => {
    expect(findingsOf(scanFixture(F, version("version: 1.2.0+abc")), ID)[0]!.title).toContain('Build number "abc"');
  });

  it("warns when Gradle hard-codes a different versionCode", () => {
    const r = scanFixture(F, edit(F, "android/app/build.gradle.kts", (s) => s.replace("versionCode = flutter.versionCode", "versionCode = 3")));
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "warn", title: "Hard-coded versionCode overrides pubspec.yaml" })]);
  });

  it("fails an invalid hard-coded CFBundleShortVersionString", () => {
    const r = scanFixture(F, edit(F, "ios/Runner/Info.plist", (s) => s.replace("<string>$(FLUTTER_BUILD_NAME)</string>", "<string>1.2 beta</string>")));
    expect(findingsOf(r, ID).map((f) => f.status)).toContain("fail");
  });
});

describe("negative", () => {
  it("passes Flutter build-setting substitutions and a numeric version", () => {
    expect(resultOf(scanFixture(F), ID).outcome).toBe("pass");
  });
});

describe("unknown", () => {
  it("warns rather than fails when pubspec.yaml has no version", () => {
    const f = findingsOf(scanFixture(F, version("")), ID);
    expect(f).toEqual([expect.objectContaining({ status: "warn", title: "pubspec.yaml has no version" })]);
  });
});
