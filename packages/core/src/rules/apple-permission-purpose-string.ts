import type { DraftFinding } from "../findings/types.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { CAPABILITIES, evidenceForDependency } from "./signals.js";

const USAGE_KEY = /^(NS\w+UsageDescription|NFCReaderUsageDescription)$/;
const PLACEHOLDER = /^(todo|tbd|fixme|placeholder|description|usage description|lorem ipsum|test|string|\.\.\.|xxx+)\b/i;
const REASON_WORDS = /\b(to|so|for|when|while|in order|lets?|allows? you|enables?|helps?|used? to|because)\b/i;

/** Heuristic: a purpose string must say why the app needs the data. */
export function weakPurposeReason(value: string): string | undefined {
  const v = value.trim();
  if (PLACEHOLDER.test(v)) return "looks like a placeholder";
  if (v.length < 12) return "is too short to explain the purpose";
  // Only judge wording for ASCII text; localized strings are out of scope for this heuristic.
  // "needs access to X" states what, not why, so it does not count as a reason.
  const withoutAsk = v
    .replace(/\b(needs?|requires?|wants?|would like|requests?)\s+(to\s+)?(access|use|permission)(\s+to)?\b/gi, " ")
    .replace(/\b(access|permission)\s+to\b/gi, " ")
    .replace(/^(please\s+)?allow\b/i, " ");
  if (/^[\x20-\x7e$()]+$/.test(v) && !REASON_WORDS.test(withoutAsk)) {
    return "does not explain how the app uses the data";
  }
  return undefined;
}

export const applePermissionPurposeString: RuleCheck = {
  id: "apple.permission-purpose-string",
  run({ project }) {
    const plists = project.appInfoPlists();
    if (!plists.length) return { skip: "no iOS Info.plist or Expo ios.infoPlist found" };
    const findings: DraftFinding[] = [];
    let checked = 0;

    for (const plist of plists) {
      const where = (key: string) => ({
        file: plist.path,
        line: lineOf(plist.raw, plist.virtualKeyPath ? `"${key}"` : `<key>${key}</key>`),
        key: plist.virtualKeyPath ? `${plist.virtualKeyPath}.${key}` : key,
      });
      for (const [key, value] of Object.entries(plist.data)) {
        if (!USAGE_KEY.test(key)) continue;
        checked++;
        if (typeof value !== "string" || value.trim() === "") {
          findings.push({
            status: "fail",
            severity: "high",
            confidence: "high",
            title: `Empty purpose string: ${key}`,
            explanation: `${key} is declared but has no text. iOS shows this string in the permission prompt, and App Review rejects prompts that do not explain the purpose.`,
            evidence: [{ ...where(key), value: typeof value === "string" ? value : String(value), description: "Purpose string is empty" }],
            recommendation: `Write a specific sentence describing what the app does with this access, e.g. "Scan receipts to add expenses." Remove the key if the feature does not exist.`,
            key: `${plist.path}#${key}#empty`,
          });
          continue;
        }
        if (value.includes("$(") && /^\$\([A-Z_]+\)$/.test(value.trim())) continue; // build-setting substitution
        const weak = weakPurposeReason(value);
        if (weak) {
          findings.push({
            status: "warn",
            severity: "medium",
            confidence: "medium",
            title: `Purpose string needs review: ${key}`,
            explanation: `The text for ${key} ${weak}. Apple expects the prompt to state clearly and completely why the app needs the access.`,
            evidence: [{ ...where(key), value, description: "Current purpose string" }],
            recommendation: "Describe the concrete feature that uses this access, in the language of the app's UI, and localize it via InfoPlist.strings when the app is localized.",
            key: `${plist.path}#${key}#weak`,
          });
        }
      }
    }

    // Keys a dependency needs that no app Info.plist declares (ITMS-90683 risk).
    // Expo config plugins add purpose strings at prebuild, so missing keys cannot be judged before that.
    if (!project.isExpoManaged("ios")) {
      const declared = new Set(plists.flatMap((p) => Object.keys(p.data)));
      for (const cap of CAPABILITIES) {
        for (const dep of cap.dependencies) {
          if (!dep.requires) continue;
          const found = project.dependencies().get(dep.name);
          if (!found || !found.direct) continue;
          for (const group of dep.requires) {
            if (group.some((k) => declared.has(k))) continue;
            const plist = plists[0]!;
            findings.push({
              status: "warn",
              severity: "high",
              confidence: "medium",
              title: `Missing purpose string ${group[0]} for ${dep.name}`,
              explanation: `${dep.name} uses ${cap.label} APIs, which require ${group.join(" or ")} in Info.plist. Without it, iOS terminates the app when access is requested, and App Store Connect may reject the upload (ITMS-90683).`,
              evidence: [
                evidenceForDependency(found),
                { file: plist.path, key: group.join(" | "), description: "Key not found in any app Info.plist" },
              ],
              recommendation: `Add ${group[0]} with a specific explanation, or remove ${dep.name} if the feature is not used. Check the plugin's README for every key it needs.`,
              key: `missing#${group.join("|")}`,
            });
          }
        }
      }
    }
    return { findings, checked: `${checked} purpose string(s) checked in ${plists.length} Info.plist file(s)` };
  },
};
