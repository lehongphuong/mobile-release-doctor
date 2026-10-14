import type { DraftFinding, Evidence } from "../findings/types.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { appCodeFiles, CAPABILITIES, searchFiles } from "./signals.js";

/** Plugins that request many permissions at runtime; their presence alone is not evidence of a specific capability. */
const GENERIC_PERMISSION_PLUGINS = ["permission_handler", "react-native-permissions"];

export const sharedPermissionUsageEvidence: RuleCheck = {
  id: "shared.permission-usage-evidence",
  run({ project }) {
    const findings: DraftFinding[] = [];
    const plists = project.hasPlatform("ios") ? project.appInfoPlists() : [];
    const manifests = project.hasPlatform("android") ? project.androidManifests() : [];
    if (!plists.length && !manifests.length) return { skip: "no Info.plist or AndroidManifest.xml found" };
    const code = appCodeFiles(project);
    const generic = GENERIC_PERMISSION_PLUGINS.map((n) => project.dependencies().get(n)).find(Boolean);
    let checked = 0;

    for (const cap of CAPABILITIES) {
      const declared: Evidence[] = [];
      for (const p of plists) {
        for (const key of cap.iosKeys) {
          if (key in p.data) declared.push({ file: p.path, line: lineOf(p.raw, key), key, description: "Declared iOS purpose string" });
        }
      }
      for (const m of manifests) {
        for (const perm of cap.androidPermissions) {
          if (m.manifest.permissions.some((x) => x.name === perm && !x.removed)) {
            declared.push({ file: m.path, line: lineOf(m.raw, perm.replace("android.permission.", "")), key: perm, description: "Declared Android permission" });
          }
        }
      }
      if (!declared.length) continue;
      checked++;
      const dep = cap.dependencies.map((d) => project.dependencies().get(d.name)).find(Boolean);
      if (dep) continue;
      const used = searchFiles(project, code, cap.sourcePatterns, 1);
      if (used.length) continue;
      findings.push({
        status: "needs_review",
        severity: "medium",
        confidence: "low",
        title: `${cap.label[0]!.toUpperCase()}${cap.label.slice(1)} permission may be unnecessary`,
        explanation: `The app declares ${cap.label} access, but the scanner found no known ${cap.label} dependency or API call in the scanned sources.${generic ? ` ${generic.name} is present and may request it at runtime.` : ""} This needs verification; it is not proof of a policy violation.`,
        evidence: [...declared, { description: `No ${cap.label} dependency or API usage found in ${code.length} scanned source file(s)` }],
        recommendation: `Confirm which feature or dependency uses ${cap.label}. If none does, remove the permission and its purpose string; both stores reject or question permissions the app does not need.`,
        key: `unused#${cap.id}`,
      });
    }
    return { findings, checked: `${checked} declared capability group(s) matched to dependencies or code` };
  },
};
