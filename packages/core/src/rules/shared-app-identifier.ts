import type { DraftFinding, Evidence } from "../findings/types.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";

const ANDROID_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const IOS_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const PLACEHOLDER = /^com\.example(\.|$)/i;

export const sharedAppIdentifier: RuleCheck = {
  id: "shared.app-identifier",
  run({ project }) {
    const findings: DraftFinding[] = [];
    const android: { id: string; ev: Evidence }[] = [];
    const ios: { id: string; ev: Evidence }[] = [];

    if (project.hasPlatform("android")) {
      for (const g of project.appGradleModules()) {
        const v = g.module.applicationId ?? g.module.namespace;
        if (v && typeof v.literal === "string") android.push({ id: v.literal, ev: { file: g.path, line: v.line, key: g.module.applicationId ? "applicationId" : "namespace", value: v.literal, description: "Android application ID" } });
      }
      if (!android.length) {
        for (const m of project.androidManifests()) {
          if (m.manifest.packageAttr) android.push({ id: m.manifest.packageAttr, ev: { file: m.path, line: lineOf(m.raw, "package="), key: "package", value: m.manifest.packageAttr, description: "Manifest package" } });
        }
      }
    }
    if (project.hasPlatform("ios")) {
      for (const pbx of project.xcodeProjects()) {
        const re = /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g;
        const seen = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = re.exec(pbx.raw))) {
          const id = m[1]!.trim().replace(/^"|"$/g, "");
          if (seen.has(id) || /Tests?$/i.test(id) || id.includes("$(")) continue;
          seen.add(id);
          ios.push({ id, ev: { file: pbx.path, line: lineOf(pbx.raw, m[0]), key: "PRODUCT_BUNDLE_IDENTIFIER", value: id, description: "iOS bundle identifier" } });
        }
      }
    }
    const expo = project.expoConfig();
    if (expo) {
      const a = (expo.expo["android"] as Record<string, unknown> | undefined)?.["package"];
      const i = (expo.expo["ios"] as Record<string, unknown> | undefined)?.["bundleIdentifier"];
      if (typeof a === "string") android.push({ id: a, ev: { file: "app.json", line: lineOf(expo.raw, '"package"'), key: "expo.android.package", value: a, description: "Expo Android package" } });
      if (typeof i === "string") ios.push({ id: i, ev: { file: "app.json", line: lineOf(expo.raw, '"bundleIdentifier"'), key: "expo.ios.bundleIdentifier", value: i, description: "Expo iOS bundle ID" } });
    }

    for (const { id, ev } of android) {
      if (PLACEHOLDER.test(id)) {
        findings.push({
          status: "fail",
          severity: "error",
          confidence: "high",
          platform: "android",
          title: `Android application ID uses the reserved prefix "com.example" (${id})`,
          explanation: "Google Play does not accept packages that start with com.example. The application ID is permanent once the app is published.",
          evidence: [ev],
          recommendation: "Choose a reverse-domain ID you own (e.g. com.yourcompany.app), set applicationId, and update namespace, MainActivity package and Firebase/Google config files to match.",
          referenceIds: ["google.application-id"],
          key: `android-placeholder#${id}`,
        });
      } else if (!ANDROID_ID.test(id)) {
        findings.push({
          status: "fail",
          severity: "error",
          confidence: "high",
          platform: "android",
          title: `Invalid Android application ID "${id}"`,
          explanation: "An application ID needs at least two segments, each starting with a letter and containing only letters, digits and underscores.",
          evidence: [ev],
          recommendation: "Fix the applicationId format.",
          referenceIds: ["google.application-id"],
          key: `android-invalid#${id}`,
        });
      }
    }
    for (const { id, ev } of ios) {
      if (PLACEHOLDER.test(id)) {
        findings.push({
          status: "warn",
          severity: "high",
          confidence: "high",
          platform: "ios",
          title: `iOS bundle identifier is still the template value (${id})`,
          explanation: "com.example identifiers come from project templates. The bundle ID must match an App ID registered to your team and cannot be changed after release.",
          evidence: [ev],
          recommendation: "Register your own bundle ID in the Apple Developer portal and set PRODUCT_BUNDLE_IDENTIFIER for the app target and its extensions.",
          referenceIds: ["apple.app-review-guidelines"],
          key: `ios-placeholder#${id}`,
        });
      } else if (!IOS_ID.test(id)) {
        findings.push({
          status: "fail",
          severity: "error",
          confidence: "high",
          platform: "ios",
          title: `Invalid iOS bundle identifier "${id}"`,
          explanation: "Bundle identifiers may contain only letters, digits, hyphens and periods.",
          evidence: [ev],
          recommendation: "Fix PRODUCT_BUNDLE_IDENTIFIER.",
          referenceIds: ["apple.app-review-guidelines"],
          key: `ios-invalid#${id}`,
        });
      }
    }
    if (!android.length && !ios.length) return { skip: "no literal application ID or bundle identifier found" };
    return { findings, checked: [...android, ...ios].map((x) => x.id).join(", ") };
  },
};
