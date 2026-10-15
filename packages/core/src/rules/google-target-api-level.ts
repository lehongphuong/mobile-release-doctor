import type { DraftFinding, Evidence } from "../findings/types.js";
import type { GradleValue } from "../parsers/gradle.js";
import type { PolicyData, TargetApiRequirement } from "../rules-engine/schema.js";
import type { RuleCheck } from "../rules-engine/types.js";
import type { ProjectContext } from "../analyzer/project.js";
import { lineOf } from "../parsers/text.js";

type FormFactor = TargetApiRequirement["form_factor"];

export function currentRequirement(policy: PolicyData, formFactor: FormFactor, now: Date): TargetApiRequirement | undefined {
  const today = now.toISOString().slice(0, 10);
  return policy.google_target_api
    .filter((r) => r.form_factor === formFactor && r.effective_from <= today && r.applies_to === "new-apps-and-updates")
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
}

function formFactorOf(project: ProjectContext): FormFactor {
  const raw = project.androidManifests().map((m) => m.raw).join("\n");
  if (/android\.hardware\.type\.watch/.test(raw)) return "wear-os";
  if (/android\.hardware\.type\.automotive/.test(raw)) return "automotive";
  if (/<uses-feature[^>]*android\.software\.leanback[^>]*android:required="true"/.test(raw)) return "android-tv";
  return "phone-tablet";
}

/** Resolve `rootProject.ext.targetSdkVersion` style references to a literal in another Gradle file. */
function resolveExt(project: ProjectContext, value: GradleValue): { value: number; file: string; line: number } | undefined {
  const name = /(?:rootProject\.ext\.|ext\.|project\.ext\.|\$)?(targetSdkVersion|targetSdk)\b/.exec(value.raw)?.[1];
  if (!name || /^flutter\./.test(value.raw) || /\blibs\./.test(value.raw)) return undefined;
  for (const g of project.gradleFiles()) {
    const m = new RegExp(`^\\s*(?:ext\\.)?${name}\\s*=\\s*(\\d+)\\b`, "m").exec(g.raw);
    if (m) return { value: Number(m[1]), file: g.path, line: lineOf(g.raw, m[0].trim()) ?? 1 };
  }
  const props = project.readText("android/gradle.properties");
  const pm = props ? new RegExp(`^\\s*${name}\\s*=\\s*(\\d+)`, "m").exec(props) : null;
  if (pm) return { value: Number(pm[1]), file: "android/gradle.properties", line: lineOf(props!, pm[0].trim()) ?? 1 };
  return undefined;
}

export const googleTargetApiLevel: RuleCheck = {
  id: "google.target-api-level",
  run({ project, policy }) {
    const formFactor = formFactorOf(project);
    const req = currentRequirement(policy, formFactor, project.now);
    const today = project.now.toISOString().slice(0, 10);
    const stale = today > policy.review_by;
    const findings: DraftFinding[] = [];

    const values: { value?: number; raw: string; evidence: Evidence }[] = [];
    for (const g of project.appGradleModules()) {
      const t = g.module.targetSdk;
      if (!t) continue;
      if (typeof t.literal === "number") {
        values.push({ value: t.literal, raw: t.raw, evidence: { file: g.path, line: t.line, key: "targetSdk", value: t.raw, description: "Target SDK" } });
        continue;
      }
      const ext = resolveExt(project, t);
      if (ext) {
        values.push({
          value: ext.value,
          raw: t.raw,
          evidence: { file: ext.file, line: ext.line, key: "targetSdkVersion", value: String(ext.value), description: `Resolved from ${t.raw} in ${g.path}` },
        });
      } else {
        values.push({ raw: t.raw, evidence: { file: g.path, line: t.line, key: "targetSdk", value: t.raw, description: "Target SDK is computed, not a literal" } });
      }
    }
    if (!values.length) {
      for (const m of project.androidManifests()) {
        const t = m.manifest.usesSdk?.targetSdkVersion;
        if (t) values.push({ value: /^\d+$/.test(t) ? Number(t) : undefined, raw: t, evidence: { file: m.path, key: "android:targetSdkVersion", value: t, description: "Target SDK from <uses-sdk>" } });
      }
    }
    const expoTarget = (() => {
      const plugins = project.expoConfig()?.expo["plugins"];
      if (!Array.isArray(plugins)) return undefined;
      for (const p of plugins) {
        if (Array.isArray(p) && p[0] === "expo-build-properties") {
          const v = (p[1] as { android?: { targetSdkVersion?: number } } | undefined)?.android?.targetSdkVersion;
          if (typeof v === "number") return v;
        }
      }
      return undefined;
    })();
    if (!values.length && expoTarget !== undefined) {
      values.push({ value: expoTarget, raw: String(expoTarget), evidence: { file: "app.json", key: "expo-build-properties.android.targetSdkVersion", value: String(expoTarget), description: "Target SDK from expo-build-properties" } });
    }

    if (!values.length) {
      if (!project.appGradleModules().length && project.framework !== "expo") return { skip: "no Android application module found" };
      findings.push({
        status: "needs_review",
        severity: "high",
        confidence: "low",
        title: "Target SDK could not be determined",
        explanation:
          project.framework === "expo"
            ? "The target SDK is set by the Expo SDK version unless expo-build-properties overrides it. The scanner does not resolve Expo SDK defaults."
            : "No targetSdk assignment was found in the app module.",
        evidence: [{ description: "No targetSdk / targetSdkVersion value found" }],
        recommendation: req
          ? `Build a release bundle and confirm its targetSdk is at least ${req.min_target_sdk} (required for ${formFactor} since ${req.effective_from}).`
          : "Build a release bundle and compare its targetSdk with Google Play's current requirement.",
        key: "unknown",
      });
      return { findings };
    }

    if (!req) {
      findings.push({
        status: "needs_review",
        severity: "high",
        confidence: "low",
        title: "No target API requirement in the policy snapshot for this date",
        explanation: `Policy snapshot ${policy.snapshot_version} has no ${formFactor} requirement effective on ${today}.`,
        evidence: values.map((v) => v.evidence),
        recommendation: "Check the current requirement in the official documentation and update policy/policy-data.yaml.",
        key: "no-requirement",
      });
      return { findings };
    }

    for (const v of values) {
      if (v.value === undefined) {
        findings.push({
          status: "needs_review",
          severity: "high",
          confidence: "medium",
          title: `Target SDK is computed (${v.raw}) – verify it meets API ${req.min_target_sdk}`,
          explanation: /^flutter\./.test(v.raw)
            ? `targetSdk comes from the Flutter Gradle plugin, so it depends on the installed Flutter SDK version. Google Play requires API ${req.min_target_sdk} or higher for ${formFactor} apps since ${req.effective_from}.`
            : `targetSdk is an expression the scanner does not evaluate. Google Play requires API ${req.min_target_sdk} or higher for ${formFactor} apps since ${req.effective_from}.`,
          evidence: [v.evidence],
          recommendation: `Check the merged value (e.g. inspect the built AAB with \`bundletool dump manifest\`) or set targetSdk explicitly to ${req.min_target_sdk} or higher after testing the behavior changes.`,
          key: `computed#${v.evidence.file}`,
        });
      } else if (v.value < req.min_target_sdk) {
        // Requirements only ever rise, so a value below a known requirement stays non-compliant even when the snapshot is stale.
        findings.push({
          status: "fail",
          severity: "error",
          confidence: "high",
          title: `targetSdk ${v.value} is below Google Play's requirement (API ${req.min_target_sdk})`,
          explanation: `Since ${req.effective_from}, new apps and app updates (${formFactor}) must target API level ${req.min_target_sdk} or higher to be submitted. Play Console will reject this upload.`,
          evidence: [v.evidence],
          recommendation: `Raise targetSdk to ${req.min_target_sdk} or higher, review the Android behavior changes for each version you skip, and update plugins that pin older SDKs.`,
          key: `below#${v.evidence.file}`,
        });
      } else if (stale) {
        findings.push({
          status: "needs_review",
          severity: "medium",
          confidence: "low",
          title: "Target API policy snapshot is out of date",
          explanation: `targetSdk ${v.value} meets the requirement known on ${policy.verified_on} (API ${req.min_target_sdk}), but the policy snapshot was due for review on ${policy.review_by}. A newer requirement may apply.`,
          evidence: [v.evidence],
          recommendation: "Update Mobile Release Doctor or check the official target API page before submitting.",
          key: `stale#${v.evidence.file}`,
        });
      }
    }
    return { findings, checked: `targetSdk meets API ${req.min_target_sdk} (${formFactor}, effective ${req.effective_from}, snapshot ${policy.snapshot_version})` };
  },
};
