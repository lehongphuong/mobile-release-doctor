import type { DraftFinding, Evidence } from "../findings/types.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";

const APPLE_VERSION = /^\d+(\.\d+){0,2}$/;
const MAX_VERSION_CODE = 2100000000;

export function parsePubspecVersion(v: string): { name: string; build?: string } {
  const plus = v.indexOf("+");
  return plus < 0 ? { name: v } : { name: v.slice(0, plus), build: v.slice(plus + 1) };
}

const isBuildSetting = (v: string) => /\$\(|\$\{/.test(v);

export const sharedReleaseVersion: RuleCheck = {
  id: "shared.release-version",
  run({ project }) {
    const findings: DraftFinding[] = [];
    const ios = project.hasPlatform("ios");
    const android = project.hasPlatform("android");
    let checked = 0;

    const badAppleVersion = (value: string, ev: Evidence, what: string, key: string) => {
      findings.push({
        status: "fail",
        severity: "error",
        confidence: "high",
        platform: "ios",
        title: `${what} "${value}" is not a valid App Store version`,
        explanation: `${what} must be one to three period-separated integers (e.g. 1.4.2). App Store Connect rejects uploads with suffixes such as -beta or letters.`,
        evidence: [ev],
        recommendation: "Use a plain numeric version (e.g. 1.4.2) and put pre-release labels in the build number or release notes instead.",
        referenceIds: ["apple.cfbundleshortversionstring"],
        key,
      });
    };

    // Flutter: pubspec.yaml is the source of truth for both platforms.
    const pubspec = project.pubspec();
    let flutterName: string | undefined;
    let flutterBuild: string | undefined;
    if (project.framework === "flutter" && pubspec) {
      checked++;
      if (!pubspec.version) {
        findings.push({
          status: "warn",
          severity: "medium",
          confidence: "high",
          title: "pubspec.yaml has no version",
          explanation: "Without a version, Flutter falls back to defaults, so builds cannot be told apart and store uploads with a repeated build number are rejected.",
          evidence: [{ file: "pubspec.yaml", key: "version", description: "Missing version field" }],
          recommendation: "Add `version: 1.0.0+1` and increase the build number (after +) for every upload.",
          key: "pubspec-missing",
        });
      } else {
        const { name, build } = parsePubspecVersion(pubspec.version);
        flutterName = name;
        flutterBuild = build;
        const ev: Evidence = { file: "pubspec.yaml", line: pubspec.versionLine, key: "version", value: pubspec.version, description: "Flutter app version" };
        if (ios && !APPLE_VERSION.test(name)) badAppleVersion(name, ev, "Version name", "pubspec-name");
        if (build === undefined) {
          findings.push({
            status: "warn",
            severity: "low",
            confidence: "high",
            title: "pubspec.yaml version has no build number",
            explanation: "Each upload to App Store Connect and Google Play needs a build number higher than the previous one. Without `+N`, the build number defaults to 1.",
            evidence: [ev],
            recommendation: "Use the form `version: 1.2.3+45` and increase the number after + for every upload.",
            key: "pubspec-no-build",
          });
        } else if (!/^\d+$/.test(build) || Number(build) < 1 || Number(build) > MAX_VERSION_CODE) {
          findings.push({
            status: "fail",
            severity: "error",
            confidence: "high",
            title: `Build number "${build}" is not a valid positive integer`,
            explanation: `Android versionCode must be a positive integer no larger than ${MAX_VERSION_CODE}, and iOS CFBundleVersion must be numeric.`,
            evidence: [ev],
            recommendation: "Use an integer build number after + (e.g. 1.2.3+45).",
            referenceIds: ["google.versioning", "apple.cfbundleshortversionstring"],
            key: "pubspec-build",
          });
        }
      }
    }

    // Android Gradle values.
    if (android) {
      for (const g of project.appGradleModules()) {
        const { versionCode, versionName } = g.module;
        checked++;
        if (versionCode && typeof versionCode.literal === "number") {
          if (versionCode.literal < 1 || versionCode.literal > MAX_VERSION_CODE) {
            findings.push({
              status: "fail",
              severity: "error",
              confidence: "high",
              platform: "android",
              title: `versionCode ${versionCode.literal} is out of range`,
              explanation: `versionCode must be between 1 and ${MAX_VERSION_CODE}.`,
              evidence: [{ file: g.path, line: versionCode.line, key: "versionCode", value: versionCode.raw, description: "Android versionCode" }],
              recommendation: "Use a positive integer that increases with every upload.",
              referenceIds: ["google.versioning"],
              key: `code-range#${g.path}`,
            });
          }
          if (project.framework === "flutter" && flutterBuild && String(versionCode.literal) !== flutterBuild) {
            findings.push({
              status: "warn",
              severity: "medium",
              confidence: "high",
              platform: "android",
              title: "Hard-coded versionCode overrides pubspec.yaml",
              explanation: `build.gradle sets versionCode ${versionCode.literal}, but pubspec.yaml says build ${flutterBuild}. Bumping pubspec.yaml will not change the Android build, which leads to "version code already used" upload errors.`,
              evidence: [
                { file: g.path, line: versionCode.line, key: "versionCode", value: versionCode.raw, description: "Hard-coded in Gradle" },
                { file: "pubspec.yaml", line: pubspec?.versionLine, key: "version", value: pubspec?.version, description: "pubspec.yaml version" },
              ],
              recommendation: "Use `versionCode flutter.versionCode` (Groovy) or `versionCode = flutter.versionCode` (Kotlin DSL).",
              referenceIds: ["google.versioning"],
              key: `code-mismatch#${g.path}`,
            });
          }
        }
        if (versionName && typeof versionName.literal === "string" && project.framework === "flutter" && flutterName && versionName.literal !== flutterName) {
          findings.push({
            status: "warn",
            severity: "medium",
            confidence: "high",
            platform: "android",
            title: "Hard-coded versionName overrides pubspec.yaml",
            explanation: `build.gradle sets versionName "${versionName.literal}" but pubspec.yaml says ${flutterName}.`,
            evidence: [{ file: g.path, line: versionName.line, key: "versionName", value: versionName.raw, description: "Hard-coded in Gradle" }],
            recommendation: "Use `versionName flutter.versionName`.",
            referenceIds: ["google.versioning"],
            key: `name-mismatch#${g.path}`,
          });
        }
        if (!versionCode && project.framework !== "flutter") {
          findings.push({
            status: "warn",
            severity: "medium",
            confidence: "medium",
            platform: "android",
            title: "No versionCode found in the app module",
            explanation: "Every Google Play upload needs a versionCode higher than the previous one.",
            evidence: [{ file: g.path, description: "defaultConfig has no versionCode" }],
            recommendation: "Set versionCode in defaultConfig (or confirm it is injected by your CI).",
            referenceIds: ["google.versioning"],
            key: `code-missing#${g.path}`,
          });
        }
      }
    }

    // iOS Info.plist and Xcode build settings.
    if (ios) {
      for (const plist of project.appInfoPlists()) {
        if (plist.virtualKeyPath) continue;
        checked++;
        const short = plist.data["CFBundleShortVersionString"];
        if (typeof short === "string" && !isBuildSetting(short)) {
          const ev: Evidence = { file: plist.path, line: lineOf(plist.raw, "<key>CFBundleShortVersionString</key>"), key: "CFBundleShortVersionString", value: short, description: "Hard-coded marketing version" };
          if (!APPLE_VERSION.test(short)) badAppleVersion(short, ev, "CFBundleShortVersionString", `plist-short#${plist.path}`);
          else if (project.framework === "flutter" && flutterName && short !== flutterName) {
            findings.push({
              status: "warn",
              severity: "medium",
              confidence: "high",
              platform: "ios",
              title: "Hard-coded CFBundleShortVersionString overrides pubspec.yaml",
              explanation: `Info.plist sets ${short} but pubspec.yaml says ${flutterName}.`,
              evidence: [ev],
              recommendation: "Use $(FLUTTER_BUILD_NAME) for CFBundleShortVersionString and $(FLUTTER_BUILD_NUMBER) for CFBundleVersion.",
              referenceIds: ["apple.cfbundleshortversionstring"],
              key: `plist-mismatch#${plist.path}`,
            });
          }
        }
        const build = plist.data["CFBundleVersion"];
        if (typeof build === "string" && !isBuildSetting(build) && !APPLE_VERSION.test(build)) {
          badAppleVersion(build, { file: plist.path, line: lineOf(plist.raw, "<key>CFBundleVersion</key>"), key: "CFBundleVersion", value: build, description: "Hard-coded build number" }, "CFBundleVersion", `plist-build#${plist.path}`);
        }
      }
      for (const pbx of project.xcodeProjects()) {
        const re = /MARKETING_VERSION = ([^;]+);/g;
        let m: RegExpExecArray | null;
        const seen = new Set<string>();
        while ((m = re.exec(pbx.raw))) {
          const v = m[1]!.trim().replace(/^"|"$/g, "");
          if (seen.has(v) || isBuildSetting(v)) continue;
          seen.add(v);
          if (!APPLE_VERSION.test(v)) badAppleVersion(v, { file: pbx.path, line: lineOf(pbx.raw, m[0]), key: "MARKETING_VERSION", value: v, description: "Xcode build setting" }, "MARKETING_VERSION", `pbx#${v}`);
        }
      }
    }

    // Expo managed config.
    const expo = project.expoConfig()?.expo;
    if (expo) {
      checked++;
      const v = expo["version"];
      if (typeof v === "string" && !APPLE_VERSION.test(v)) {
        badAppleVersion(v, { file: "app.json", line: lineOf(project.expoConfig()!.raw, '"version"'), key: "expo.version", value: v, description: "Expo app version" }, "expo.version", "expo-version");
      }
      const vc = (expo["android"] as Record<string, unknown> | undefined)?.["versionCode"];
      if (vc !== undefined && (typeof vc !== "number" || !Number.isInteger(vc) || vc < 1 || vc > MAX_VERSION_CODE)) {
        findings.push({
          status: "fail",
          severity: "error",
          confidence: "high",
          platform: "android",
          title: `expo.android.versionCode "${String(vc)}" is invalid`,
          explanation: `versionCode must be an integer between 1 and ${MAX_VERSION_CODE}.`,
          evidence: [{ file: "app.json", key: "expo.android.versionCode", value: String(vc), description: "Expo versionCode" }],
          recommendation: "Use a positive integer (or let EAS manage it with autoIncrement).",
          referenceIds: ["google.versioning"],
          key: "expo-versioncode",
        });
      }
    }

    if (!checked) return { skip: "no version configuration found" };
    return { findings, checked: `${checked} version source(s) checked` };
  },
};
