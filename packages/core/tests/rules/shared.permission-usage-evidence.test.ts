import { describe, expect, it } from "vitest";
import { edit, findingsOf, manifest, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.permission-usage-evidence";
const F = "flutter/clean-project";
const PLIST = "ios/Runner/Info.plist";
const addKey = (key: string, text: string) => edit(F, PLIST, (s) => s.replace("<key>UILaunchStoryboardName</key>", `<key>${key}</key>\n\t<string>${text}</string>\n\t<key>UILaunchStoryboardName</key>`));

describe("positive", () => {
  it("asks to verify a permission with no dependency or API usage (spec example)", () => {
    const r = scanFixture(F, addKey("NSMicrophoneUsageDescription", "Record a voice note to attach to your daily check-in."));
    const [f] = findingsOf(r, ID);
    expect(f).toMatchObject({ status: "needs_review", title: "Microphone permission may be unnecessary" });
    expect(f!.evidence[0]).toMatchObject({ file: PLIST, key: "NSMicrophoneUsageDescription" });
    expect(f!.explanation).toContain("not proof");
  });
});

describe("negative", () => {
  it("accepts permissions used by a dependency (image_picker → camera/photos)", () => {
    expect(resultOf(scanFixture(F), ID).outcome).toBe("pass");
  });

  it("accepts permissions used by native code", () => {
    const r = scanFixture(F, {
      ...addKey("NSContactsUsageDescription", "Invite friends from your contacts to share a habit."),
      "ios/Runner/Invite.swift": "import Contacts\nlet store = CNContactStore()\n",
    });
    expect(findingsOf(r, ID)).toEqual([]);
  });
});

describe("unknown", () => {
  it("mentions generic permission plugins that may request it indirectly", () => {
    const r = scanFixture(F, {
      [ "android/app/src/main/AndroidManifest.xml"]: manifest(["RECORD_AUDIO"]),
      ...edit(F, "pubspec.yaml", (s) => s.replace("  shared_preferences: ^2.3.2", "  shared_preferences: ^2.3.2\n  permission_handler: ^11.3.1")),
    });
    expect(findingsOf(r, ID)[0]!.explanation).toContain("permission_handler");
  });
});
