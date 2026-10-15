import { describe, expect, it } from "vitest";
import { edit, findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.app-identifier";
const F = "flutter/clean-project";

describe("positive", () => {
  it("fails com.example on Android and warns on iOS", () => {
    const f = findingsOf(scanFixture("flutter/risky-project"), ID);
    expect(f.map((x) => [x.platform, x.status, x.severity])).toEqual([
      ["android", "fail", "error"],
      ["ios", "warn", "high"],
    ]);
  });

  it("fails an invalid Android application ID", () => {
    const r = scanFixture(F, edit(F, "android/app/build.gradle.kts", (s) => s.replace('applicationId = "app.habitgarden"', 'applicationId = "habitgarden"')));
    expect(findingsOf(r, ID)[0]!.title).toContain("Invalid Android application ID");
  });
});

describe("negative", () => {
  it("passes real identifiers and ignores test target bundle IDs", () => {
    const r = scanFixture(F);
    expect(resultOf(r, ID)).toMatchObject({ outcome: "pass", reason: "app.habitgarden, app.habitgarden" });
  });

  it("reads Expo app.json identifiers", () => {
    expect(resultOf(scanFixture("expo/clean-project"), ID).outcome).toBe("pass");
  });
});

describe("unknown", () => {
  it("skips when identifiers are computed (e.g. flavors)", () => {
    const r = scanFixture(F, {
      ...edit(F, "android/app/build.gradle.kts", (s) => s.replace('applicationId = "app.habitgarden"', "applicationId = appIdFromFlavor").replace('namespace = "app.habitgarden"', "namespace = ns")),
      "ios/Runner.xcodeproj/project.pbxproj": "{ PRODUCT_BUNDLE_IDENTIFIER = \"$(APP_ID)\"; }",
    });
    expect(resultOf(r, ID).outcome).toBe("skip");
  });
});
