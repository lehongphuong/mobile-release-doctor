import type { DraftFinding, Evidence } from "../findings/types.js";
import { isDict, parsePlist, type PlistValue } from "../parsers/plist.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { appCodeFiles, matchEvidence, searchFiles } from "./signals.js";

/** Categories, API signals and approved reason codes from Apple's documentation (fetched 2026-10-14). */
export const REQUIRED_REASON_CATEGORIES: { category: string; label: string; patterns: RegExp[]; reasons: string[] }[] = [
  {
    category: "NSPrivacyAccessedAPICategoryUserDefaults",
    label: "User defaults",
    patterns: [/\bUserDefaults\b/, /\bNSUserDefaults\b/],
    reasons: ["CA92.1", "1C8F.1", "C56D.1", "AC6B.1"],
  },
  {
    category: "NSPrivacyAccessedAPICategoryFileTimestamp",
    label: "File timestamp",
    patterns: [
      /\b(creationDate|modificationDate|fileModificationDate|contentModificationDateKey|creationDateKey)\b/,
      /\bNSFile(Creation|Modification)Date\b/,
      /\b(getattrlist|getattrlistbulk|fgetattrlist|getattrlistat|fstatat|fstat|lstat)\s*\(/,
      /(?<![\w.])stat\s*\(/,
    ],
    reasons: ["DDA9.1", "C617.1", "3B52.1", "0A2A.1"],
  },
  {
    category: "NSPrivacyAccessedAPICategorySystemBootTime",
    label: "System boot time",
    patterns: [/\bsystemUptime\b/, /\bmach_absolute_time\s*\(/],
    reasons: ["35F9.1", "8FFB.1", "3D61.1"],
  },
  {
    category: "NSPrivacyAccessedAPICategoryDiskSpace",
    label: "Disk space",
    patterns: [
      /\bvolume(Available|Total)Capacity\w*Key\b/,
      /\bNSFileSystem(Free)?Size\b/,
      /\bsystem(Free)?Size\b/,
      /\b(statfs|statvfs|fstatfs|fstatvfs)\s*\(/,
    ],
    reasons: ["85F4.1", "E174.1", "7D9E.1", "B728.1"],
  },
  {
    category: "NSPrivacyAccessedAPICategoryActiveKeyboards",
    label: "Active keyboards",
    patterns: [/\bactiveInputModes\b/],
    reasons: ["3EC4.1", "54BD.1"],
  },
];

function declaredCategories(value: PlistValue): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!isDict(value)) return out;
  const types = value["NSPrivacyAccessedAPITypes"];
  if (!Array.isArray(types)) return out;
  for (const t of types) {
    if (!isDict(t)) continue;
    const cat = t["NSPrivacyAccessedAPIType"];
    const reasons = t["NSPrivacyAccessedAPITypeReasons"];
    if (typeof cat === "string") out.set(cat, Array.isArray(reasons) ? reasons.filter((r): r is string => typeof r === "string") : []);
  }
  return out;
}

export const appleRequiredReasonApi: RuleCheck = {
  id: "apple.required-reason-api",
  run({ project }) {
    const sources = appCodeFiles(project, "ios").filter((f) => !/(^|\/)(android|node_modules)\//.test(f));
    const manifests = project.files.filter((f) => /(^|\/)PrivacyInfo\.xcprivacy$/.test(f) && !/(^|\/)(Pods|node_modules)\//.test(f));
    if (!sources.length && !manifests.length) return { skip: "no app-owned Swift/Objective-C sources or privacy manifest found" };

    const findings: DraftFinding[] = [];
    const declared = new Map<string, { reasons: string[]; file: string }>();
    for (const file of manifests) {
      const raw = project.readText(file);
      if (raw === undefined) continue;
      try {
        for (const [cat, reasons] of declaredCategories(parsePlist(raw))) declared.set(cat, { reasons, file });
      } catch (e) {
        findings.push({
          status: "fail",
          severity: "high",
          confidence: "high",
          title: "Privacy manifest cannot be parsed",
          explanation: `${file} is not a valid property list (${(e as Error).message}). App Store Connect cannot read declarations from an invalid manifest.`,
          evidence: [{ file, description: "Invalid property list" }],
          recommendation: "Recreate the file with Xcode (File > New > File > App Privacy) and re-add your declarations.",
          key: `invalid#${file}`,
        });
      }
    }

    const used = REQUIRED_REASON_CATEGORIES.map((c) => ({ ...c, matches: searchFiles(project, sources, c.patterns, 5) })).filter(
      (c) => c.matches.length > 0,
    );

    if (used.length && !manifests.length) {
      findings.push({
        status: "warn",
        severity: "high",
        confidence: "medium",
        title: "Required reason APIs used without an app privacy manifest",
        explanation: `App-owned iOS code appears to use ${used.map((u) => u.label).join(", ")} APIs, but no PrivacyInfo.xcprivacy was found. Apple requires apps to declare approved reasons for these APIs; uploads without them receive ITMS-91053.`,
        evidence: used.flatMap((u) => matchEvidence(u.matches, `${u.label} API (${u.category})`, 2)),
        recommendation:
          "Add PrivacyInfo.xcprivacy to the app target (Xcode: File > New > File > App Privacy) and declare each category with the reason code that matches your use.",
        key: "no-manifest",
      });
    }
    for (const u of used) {
      if (!manifests.length) break;
      if (declared.has(u.category)) continue;
      findings.push({
        status: "warn",
        severity: "high",
        confidence: "medium",
        title: `${u.category} not declared in privacy manifest`,
        explanation: `App-owned code appears to use ${u.label} APIs, but the privacy manifest does not list ${u.category}.`,
        evidence: [...matchEvidence(u.matches, `${u.label} API`, 3), { file: manifests[0], description: "Category missing from NSPrivacyAccessedAPITypes" }],
        recommendation: `Add an NSPrivacyAccessedAPITypes entry for ${u.category} with an approved reason (${u.reasons.join(", ")}), choosing the one that matches your use.`,
        key: `undeclared#${u.category}`,
      });
    }
    for (const [cat, { reasons, file }] of declared) {
      const def = REQUIRED_REASON_CATEGORIES.find((c) => c.category === cat);
      const raw = project.readText(file) ?? "";
      if (!def) {
        findings.push({
          status: "warn",
          severity: "medium",
          confidence: "medium",
          title: `Unknown API category ${cat}`,
          explanation: `${cat} is not in the scanner's list of required reason API categories. It may be a typo or a category added after this rule snapshot.`,
          evidence: [{ file, line: lineOf(raw, cat), value: cat, description: "Declared category" }],
          recommendation: "Compare the category name with Apple's documentation.",
          key: `unknown-cat#${cat}`,
        });
        continue;
      }
      const invalid = reasons.filter((r) => !def.reasons.includes(r));
      if (!reasons.length || invalid.length) {
        findings.push({
          status: "fail",
          severity: "high",
          confidence: "high",
          title: `Invalid reason code for ${cat}`,
          explanation: reasons.length
            ? `Reason code(s) ${invalid.join(", ")} are not approved for ${cat}. Approved codes: ${def.reasons.join(", ")}.`
            : `${cat} is declared without any reason code.`,
          evidence: [{ file, line: lineOf(raw, cat), key: cat, value: reasons.join(", ") || "(none)", description: "Declared reasons" }],
          recommendation: "Pick the approved reason code that describes your use; do not invent codes.",
          key: `invalid-reason#${cat}`,
        });
      }
    }

    // A manifest that is not a member of the app target is not bundled.
    for (const pbx of project.xcodeProjects()) {
      if (!manifests.length || /PBXFileSystemSynchronizedRootGroup/.test(pbx.raw)) continue;
      if (!pbx.raw.includes("PrivacyInfo.xcprivacy")) {
        const ev: Evidence[] = [
          { file: manifests[0], description: "Privacy manifest exists on disk" },
          { file: pbx.path, description: "project.pbxproj does not reference PrivacyInfo.xcprivacy" },
        ];
        findings.push({
          status: "warn",
          severity: "high",
          confidence: "medium",
          title: "Privacy manifest is not added to the Xcode project",
          explanation: "The file exists but the Xcode project does not reference it, so it is probably not copied into the app bundle.",
          evidence: ev,
          recommendation: "Add PrivacyInfo.xcprivacy to the Runner/app target in Xcode (Target Membership) and confirm it appears in Copy Bundle Resources.",
          key: `not-in-target#${pbx.path}`,
        });
      }
    }

    return {
      findings,
      checked: `${sources.length} app-owned iOS source file(s) and ${manifests.length} privacy manifest(s) checked; third-party SDK manifests are out of scope`,
    };
  },
};
