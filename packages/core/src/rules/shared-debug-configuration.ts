import type { DraftFinding } from "../findings/types.js";
import { isDict } from "../parsers/plist.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";

export const sharedDebugConfiguration: RuleCheck = {
  id: "shared.debug-configuration",
  run({ project }) {
    const findings: DraftFinding[] = [];
    let checked = 0;

    if (project.hasPlatform("android")) {
      for (const g of project.appGradleModules()) {
        checked++;
        const release = g.module.buildTypes.find((b) => b.name === "release");
        if (!release) continue;
        if (release.signingConfig && /signingConfigs\s*\.\s*(debug\b|getByName\(\s*["']debug["']\s*\))/.test(release.signingConfig.raw)) {
          findings.push({
            status: "fail",
            severity: "high",
            confidence: "high",
            platform: "android",
            title: "Release build is signed with the debug key",
            explanation:
              "The release build type uses signingConfigs.debug (the default in new Flutter projects). Google Play rejects bundles signed with a debug certificate, and the debug key is not yours to keep.",
            evidence: [{ file: g.path, line: release.signingConfig.line, key: "buildTypes.release.signingConfig", value: release.signingConfig.raw, description: "Release signing config" }],
            recommendation:
              "Create an upload keystore, reference it from a release signingConfig loaded from key.properties (kept out of git), and enroll in Play App Signing.",
            referenceIds: ["google.app-signing"],
            key: `debug-signing#${g.path}`,
          });
        }
        if (release.debuggable?.literal === true) {
          findings.push({
            status: "fail",
            severity: "high",
            confidence: "high",
            platform: "android",
            title: "Release build type is debuggable",
            explanation: "debuggable true in the release build type lets anyone attach a debugger to the production app. Google Play does not accept debuggable builds.",
            evidence: [{ file: g.path, line: release.debuggable.line, key: "buildTypes.release.debuggable", value: release.debuggable.raw, description: "Release debuggable flag" }],
            recommendation: "Remove debuggable from the release build type.",
            referenceIds: ["google.android-debuggable"],
            key: `debuggable#${g.path}`,
          });
        }
      }
      for (const m of project.androidManifests()) {
        if (m.virtual) continue;
        checked++;
        const app = m.manifest.application ?? {};
        if (app["android:debuggable"] === "true") {
          findings.push({
            status: "fail",
            severity: "high",
            confidence: "high",
            platform: "android",
            title: "android:debuggable=\"true\" in the main manifest",
            explanation: "Hard-coding debuggable in src/main applies it to release builds too.",
            evidence: [{ file: m.path, line: lineOf(m.raw, "android:debuggable"), key: "android:debuggable", value: "true", description: "<application> attribute" }],
            recommendation: "Remove the attribute; the build type sets it automatically.",
            referenceIds: ["google.android-debuggable"],
            key: `manifest-debuggable#${m.path}`,
          });
        }
        if (app["android:usesCleartextTraffic"] === "true") {
          findings.push({
            status: "warn",
            severity: "medium",
            confidence: "high",
            platform: "android",
            title: "Cleartext (HTTP) traffic is allowed for all domains",
            explanation: "android:usesCleartextTraffic=\"true\" in src/main enables unencrypted traffic in release builds.",
            evidence: [{ file: m.path, line: lineOf(m.raw, "android:usesCleartextTraffic"), key: "android:usesCleartextTraffic", value: "true", description: "<application> attribute" }],
            recommendation: "Remove it, or use a network security config that allows cleartext only for the specific domains that need it (and only in debug if possible).",
            referenceIds: ["google.cleartext-traffic"],
            key: `cleartext#${m.path}`,
          });
        }
      }
    }

    if (project.hasPlatform("ios")) {
      for (const plist of project.appInfoPlists()) {
        checked++;
        const ats = plist.data["NSAppTransportSecurity"];
        if (isDict(ats) && ats["NSAllowsArbitraryLoads"] === true) {
          findings.push({
            status: "warn",
            severity: "medium",
            confidence: "high",
            platform: "ios",
            title: "App Transport Security is disabled (NSAllowsArbitraryLoads)",
            explanation:
              "NSAllowsArbitraryLoads turns off HTTPS enforcement for all connections. App Review may ask for a justification, and it is often a leftover from development.",
            evidence: [{ file: plist.path, line: lineOf(plist.raw, "NSAllowsArbitraryLoads"), key: "NSAppTransportSecurity.NSAllowsArbitraryLoads", value: "true", description: "ATS exception" }],
            recommendation: "Remove it and add NSExceptionDomains only for hosts that cannot use HTTPS, or move the exception to a debug-only Info.plist.",
            referenceIds: ["apple.app-transport-security"],
            key: `ats#${plist.path}`,
          });
        }
      }
    }
    if (!checked) return { skip: "no release configuration files found" };
    return { findings, checked: `${checked} build/configuration file(s) checked` };
  },
};
