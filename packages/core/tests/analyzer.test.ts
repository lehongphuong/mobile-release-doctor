import { describe, expect, it } from "vitest";
import { detectFramework, findCandidateProjects } from "../src/analyzer/detect.js";
import { globToRegExp } from "../src/analyzer/walk.js";
import { parseAndroidManifest } from "../src/parsers/android-manifest.js";
import { parseGradle } from "../src/parsers/gradle.js";
import { parsePlist } from "../src/parsers/plist.js";
import { stripCLikeComments } from "../src/parsers/text.js";
import { FIXTURES, makeProject, scanFixture } from "./helpers.js";
import { join } from "node:path";

describe("framework detection", () => {
  it.each([
    ["flutter/clean-project", "flutter", ["ios", "android"]],
    ["flutter/account-deletion-unknown", "flutter", ["android"]],
    ["react-native/clean-project", "react-native", ["ios", "android"]],
    ["expo/clean-project", "expo", ["ios", "android"]],
    ["native-ios/clean-project", "native-ios", ["ios"]],
    ["native-android/clean-project", "native-android", ["android"]],
  ])("%s → %s", (fixture, framework, platforms) => {
    expect(detectFramework(join(FIXTURES, fixture))).toMatchObject({ framework, platforms });
  });

  it("does not detect unsupported projects", () => {
    expect(detectFramework(makeProject("", { "package.json": '{"dependencies":{"react":"18"}}' }))).toBeUndefined();
    expect(detectFramework(makeProject("", { "pubspec.yaml": "name: a_dart_cli\n" }))).toBeUndefined();
  });

  it("lists sub-projects in a monorepo", () => {
    const root = makeProject("", {});
    const app = makeProject("flutter/clean-project");
    const mono = makeProject("", { "apps/mobile/pubspec.yaml": `name: x\ndependencies:\n  flutter:\n    sdk: flutter\n`, "apps/mobile/ios/.keep": "", "package.json": "{}" });
    expect(findCandidateProjects(mono)).toEqual([{ path: "apps/mobile", framework: "flutter" }]);
    expect(findCandidateProjects(root)).toEqual([]);
    expect(app).toBeTruthy();
  });

  it("explains how to pick a sub-project", () => {
    const mono = makeProject("", { "apps/mobile/pubspec.yaml": `name: x\ndependencies:\n  flutter:\n    sdk: flutter\n` });
    expect(() => scanFixture("", {}, { project: mono })).toThrow(/apps\/mobile \(flutter\)/);
  });
});

describe("parsers", () => {
  it("parses plists including nested dicts, arrays, booleans and empty strings", () => {
    const v = parsePlist(`<?xml version="1.0"?><plist version="1.0"><dict>
      <key>A</key><string/><key>B</key><true/><key>C</key><array><integer>3</integer><string>x &amp; y</string></array>
      <key>D</key><dict><key>E</key><false/></dict></dict></plist>`);
    expect(v).toEqual({ A: "", B: true, C: [3, "x & y"], D: { E: false } });
  });

  it("rejects binary and malformed plists with a clear error", () => {
    expect(() => parsePlist("bplist00...")).toThrow(/binary plist/);
    expect(() => parsePlist("<plist><dict><key>A</key></dict></plist>")).toThrow(/no value/);
  });

  it("parses manifest permissions, removals and components", () => {
    const m = parseAndroidManifest(`<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools" package="a.b">
      <uses-permission android:name="android.permission.CAMERA"/>
      <uses-permission android:name="android.permission.READ_SMS" tools:node="remove"/>
      <uses-permission-sdk-23 android:name="android.permission.READ_CONTACTS" android:maxSdkVersion="28"/>
      <application android:debuggable="true"><service android:name=".S" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"/></application>
    </manifest>`);
    expect(m.packageAttr).toBe("a.b");
    expect(m.permissions).toEqual([
      { name: "android.permission.CAMERA", maxSdkVersion: undefined, removed: false },
      { name: "android.permission.READ_SMS", maxSdkVersion: undefined, removed: true },
      { name: "android.permission.READ_CONTACTS", maxSdkVersion: 28, removed: false },
    ]);
    expect(m.application?.["android:debuggable"]).toBe("true");
    expect(m.components[0]).toMatchObject({ type: "service" });
  });

  it("accepts empty library manifests", () => {
    expect(parseAndroidManifest("<manifest>\n</manifest>\n").permissions).toEqual([]);
    expect(parseAndroidManifest('<manifest package="a.b"/>').packageAttr).toBe("a.b");
  });

  it("rejects malformed XML", () => {
    expect(() => parseAndroidManifest("<manifest><application></manifest>")).toThrow(/invalid XML/);
  });

  it("extracts Groovy and Kotlin DSL values without evaluating them", () => {
    const groovy = parseGradle(`plugins { id "com.android.application" }
android {
  defaultConfig {
    applicationId "com.acme.app"
    targetSdkVersion 34 // comment
    versionCode 7
  }
  buildTypes {
    debug { debuggable true }
    release {
      signingConfig signingConfigs.debug
    }
  }
}`);
    expect(groovy).toMatchObject({ isApplication: true, applicationId: { literal: "com.acme.app" }, targetSdk: { literal: 34, line: 5 }, versionCode: { literal: 7 } });
    expect(groovy.buildTypes.map((b) => b.name)).toEqual(["debug", "release"]);
    expect(groovy.buildTypes[1]!.signingConfig?.raw).toBe("signingConfigs.debug");

    const kts = parseGradle(`plugins { id("com.android.application") }
android {
    defaultConfig {
        applicationId = "com.acme.app"
        targetSdk = flutter.targetSdkVersion
    }
    buildTypes {
        getByName("release") { signingConfig = signingConfigs.getByName("debug") }
    }
}`);
    expect(kts.targetSdk).toMatchObject({ raw: "flutter.targetSdkVersion", literal: undefined });
    expect(kts.buildTypes[0]).toMatchObject({ name: "release", signingConfig: { raw: 'signingConfigs.getByName("debug")' } });
  });

  it("strips comments but keeps strings and line numbers", () => {
    const src = 'a // x\n/* b\nc */ d "// not a comment"\n';
    const out = stripCLikeComments(src);
    expect(out.split("\n")).toHaveLength(4);
    expect(out).toContain('"// not a comment"');
    expect(out).not.toContain("x");
  });

  it("matches simple globs", () => {
    expect(globToRegExp("lib/generated").test("lib/generated/a.dart")).toBe(true);
    expect(globToRegExp("**/*.g.dart").test("lib/x/a.g.dart")).toBe(true);
    expect(globToRegExp("*.md").test("docs/a.md")).toBe(false);
  });
});

describe("malformed inputs", () => {
  it("turns broken config files into diagnostics and keeps scanning", () => {
    const r = scanFixture("flutter/clean-project", {
      "android/app/src/main/AndroidManifest.xml": "<manifest><application>",
      "pubspec.lock": "packages: [unclosed",
    });
    expect(r.diagnostics.map((d) => d.file)).toEqual(expect.arrayContaining(["android/app/src/main/AndroidManifest.xml", "pubspec.lock"]));
    expect(r.rule_results.some((x) => x.outcome === "error")).toBe(false);
  });

  it("honours exclude_paths", () => {
    const r = scanFixture("flutter/clean-project", {
      ".release-doctor.yml": "app:\n  has_account_creation: false\n  privacy_policy_url: https://habitgarden.app/privacy\nexclude_paths:\n  - lib/legacy\n",
      "lib/legacy/old.dart": "const t = 'Lorem ipsum';\n",
    });
    expect(r.findings).toEqual([]);
  });
});
