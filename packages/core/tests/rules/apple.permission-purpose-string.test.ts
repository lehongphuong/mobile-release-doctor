import { describe, expect, it } from "vitest";
import { weakPurposeReason } from "../../src/rules/apple-permission-purpose-string.js";
import { edit, findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "apple.permission-purpose-string";
const F = "flutter/clean-project";
const PLIST = "ios/Runner/Info.plist";

describe("positive", () => {
  it("fails on an empty purpose string with file, line and key", () => {
    const r = scanFixture(F, edit(F, PLIST, (s) => s.replace("Take a photo of your habit to check in for the day.", "")));
    const [f] = findingsOf(r, ID);
    expect(f).toMatchObject({ status: "fail", severity: "high" });
    expect(f!.evidence[0]).toMatchObject({ file: PLIST, key: "NSCameraUsageDescription" });
    expect(f!.evidence[0]!.line).toBeGreaterThan(1);
  });

  it("warns on vague purpose strings", () => {
    const r = scanFixture(F, edit(F, PLIST, (s) => s.replace("Take a photo of your habit to check in for the day.", "This app needs access to your camera")));
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "warn", title: expect.stringContaining("NSCameraUsageDescription") })]);
  });

  it("warns when a dependency needs a key that is missing", () => {
    const r = scanFixture(F, edit(F, PLIST, (s) => s.replace(/\t<key>NSPhotoLibraryUsageDescription<\/key>\n\t<string>[^<]*<\/string>\n/, "")));
    const f = findingsOf(r, ID);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ status: "warn", severity: "high", title: expect.stringContaining("NSPhotoLibraryUsageDescription for image_picker") });
    expect(f[0]!.evidence[0]).toMatchObject({ file: "pubspec.yaml", key: "image_picker" });
  });
});

describe("negative", () => {
  it("passes specific purpose strings that match dependencies", () => {
    const r = scanFixture(F);
    expect(findingsOf(r, ID)).toEqual([]);
    expect(resultOf(r, ID).outcome).toBe("pass");
  });

  it("does not judge wording of non-English strings", () => {
    expect(weakPurposeReason("Chụp ảnh thói quen của bạn để điểm danh mỗi ngày.")).toBeUndefined();
    expect(weakPurposeReason("Scan receipts to add expenses.")).toBeUndefined();
    expect(weakPurposeReason("Allow camera access")).toBeDefined();
    expect(weakPurposeReason("TODO")).toBeDefined();
  });
});

describe("unknown", () => {
  it("does not judge missing keys in Expo managed projects (config plugins add them at prebuild)", () => {
    const r = scanFixture("expo/clean-project", {
      "package.json": JSON.stringify({ dependencies: { expo: "~52.0.0", "react-native": "0.76.5", "expo-camera": "~16.0.0" } }),
      "modules/NotificationService/Info.plist": "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>NSExtension</key><dict/></dict></plist>",
    });
    expect(findingsOf(r, ID)).toEqual([]);
  });

  it("skips when the project has no Info.plist", () => {
    const r = scanFixture(F, { "ios/Runner/Info.plist": null });
    expect(resultOf(r, ID)).toMatchObject({ outcome: "skip" });
  });

  it("reports an unparsable Info.plist as a diagnostic instead of crashing", () => {
    const r = scanFixture(F, { [PLIST]: "<plist><dict><key>Broken</key></dict>" });
    expect(r.diagnostics.some((d) => d.file === PLIST && d.level === "error")).toBe(true);
    expect(resultOf(r, ID).outcome).toBe("skip");
  });
});
