import { describe, expect, it } from "vitest";
import { findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "apple.required-reason-api";
const F = "flutter/clean-project";
const DELEGATE = "ios/Runner/AppDelegate.swift";
const swiftUsingDefaults = `import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  func launches() -> Int { UserDefaults.standard.integer(forKey: "launches") }
}
`;
const manifest = (category: string, reason: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>NSPrivacyAccessedAPITypes</key>
<array><dict>
<key>NSPrivacyAccessedAPIType</key><string>${category}</string>
<key>NSPrivacyAccessedAPITypeReasons</key><array><string>${reason}</string></array>
</dict></array>
</dict></plist>`;
const pbxWithManifest = `// !$*UTF8*$!
{ objects = { A /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; }; B = { buildSettings = { PRODUCT_BUNDLE_IDENTIFIER = app.habitgarden; }; }; }; }`;

describe("positive", () => {
  it("warns when app code uses UserDefaults without a privacy manifest", () => {
    const r = scanFixture(F, { [DELEGATE]: swiftUsingDefaults });
    const [f] = findingsOf(r, ID);
    expect(f).toMatchObject({ status: "warn", severity: "high" });
    expect(f!.evidence[0]).toMatchObject({ file: DELEGATE, line: 6 });
  });

  it("fails on a reason code that is not approved for the category", () => {
    const r = scanFixture(F, {
      [DELEGATE]: swiftUsingDefaults,
      "ios/Runner/PrivacyInfo.xcprivacy": manifest("NSPrivacyAccessedAPICategoryUserDefaults", "35F9.1"),
      "ios/Runner.xcodeproj/project.pbxproj": pbxWithManifest,
    });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "fail", title: expect.stringContaining("Invalid reason code") })]);
  });

  it("warns when the manifest is on disk but not in the Xcode project", () => {
    const r = scanFixture(F, {
      [DELEGATE]: swiftUsingDefaults,
      "ios/Runner/PrivacyInfo.xcprivacy": manifest("NSPrivacyAccessedAPICategoryUserDefaults", "CA92.1"),
    });
    expect(findingsOf(r, ID).map((f) => f.title)).toEqual(["Privacy manifest is not added to the Xcode project"]);
  });
});

describe("negative", () => {
  it("passes when declared with an approved reason and included in the project", () => {
    const r = scanFixture(F, {
      [DELEGATE]: swiftUsingDefaults,
      "ios/Runner/PrivacyInfo.xcprivacy": manifest("NSPrivacyAccessedAPICategoryUserDefaults", "CA92.1"),
      "ios/Runner.xcodeproj/project.pbxproj": pbxWithManifest,
    });
    expect(findingsOf(r, ID)).toEqual([]);
    expect(resultOf(r, ID).outcome).toBe("pass");
  });

  it("ignores API names in comments", () => {
    const r = scanFixture(F, { [DELEGATE]: "import UIKit\n// UserDefaults is used by plugins only\nclass A {}\n" });
    expect(findingsOf(r, ID)).toEqual([]);
  });

  it("does not flag the plain Flutter template", () => {
    expect(findingsOf(scanFixture(F), ID)).toEqual([]);
  });
});

describe("unknown", () => {
  it("skips when there are no app-owned iOS sources (e.g. Expo managed)", () => {
    const r = scanFixture(F, { [DELEGATE]: null });
    expect(resultOf(r, ID).outcome).toBe("skip");
  });
});
