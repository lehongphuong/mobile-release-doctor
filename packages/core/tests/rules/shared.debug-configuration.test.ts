import { describe, expect, it } from "vitest";
import { edit, findingsOf, manifest, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.debug-configuration";
const F = "flutter/clean-project";
const GRADLE = "android/app/build.gradle.kts";

describe("positive", () => {
  it("fails a release build signed with the debug key (Kotlin DSL)", () => {
    const r = scanFixture(F, edit(F, GRADLE, (s) => s.replace('signingConfigs.getByName("release")', 'signingConfigs.getByName("debug")')));
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "fail", title: "Release build is signed with the debug key", evidence: [expect.objectContaining({ file: GRADLE })] })]);
  });

  it("fails the Flutter Groovy template default", () => {
    const titles = findingsOf(scanFixture("flutter/risky-project"), ID).map((f) => f.title);
    expect(titles).toContain("Release build is signed with the debug key");
  });

  it("fails a debuggable release build and flags cleartext / ATS", () => {
    const r = scanFixture(F, {
      ...edit(F, GRADLE, (s) => s.replace("isMinifyEnabled = true", "isMinifyEnabled = true\n            isDebuggable = true")),
      "android/app/src/main/AndroidManifest.xml": manifest([], 'android:label="Habit Garden" android:usesCleartextTraffic="true"'),
      ...edit(F, "ios/Runner/Info.plist", (s) => s.replace("<key>LSRequiresIPhoneOS</key>", "<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key><true/></dict>\n\t<key>LSRequiresIPhoneOS</key>")),
    });
    expect(findingsOf(r, ID).map((f) => [f.status, f.platform])).toEqual([
      ["fail", "android"],
      ["warn", "android"],
      ["warn", "ios"],
    ]);
  });
});

describe("negative", () => {
  it("passes a release signing config and debug-only manifests", () => {
    expect(resultOf(scanFixture(F), ID).outcome).toBe("pass");
  });

  it("ignores commented-out debug signing", () => {
    const r = scanFixture(F, edit(F, GRADLE, (s) => s.replace('signingConfig = signingConfigs.getByName("release")', '// signingConfig = signingConfigs.getByName("debug")\n            signingConfig = signingConfigs.getByName("release")')));
    expect(findingsOf(r, ID)).toEqual([]);
  });
});

describe("unknown", () => {
  it("skips when there are no build configuration files", () => {
    const r = scanFixture(F, { android: null, ios: null }, {});
    expect(resultOf(r, ID).outcome).toBe("skip");
  });
});
