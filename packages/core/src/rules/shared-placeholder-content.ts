import type { DraftFinding } from "../findings/types.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { appCodeFiles, matchEvidence, searchFiles } from "./signals.js";

const TEMPLATES: { framework: string; patterns: RegExp[]; label: string }[] = [
  { framework: "flutter", label: "Flutter counter template", patterns: [/Flutter Demo Home Page/, /You have pushed the button this many times/] },
  { framework: "react-native", label: "React Native welcome template", patterns: [/Welcome to React Native/, /Edit <Text style=\{styles\.highlight\}>App\.tsx<\/Text>/, /Edit App\.(tsx|js) to change this screen/] },
  { framework: "expo", label: "Expo starter template", patterns: [/Open up App\.(js|tsx) to start working on your app!/, /Edit app\/\(tabs\)\/index\.tsx to see changes/] },
];

const LOREM = [/\blorem ipsum\b/i];
const UNFINISHED = [/["'`](?:coming soon|under construction|feature coming soon|sắp ra mắt)[.!]?["'`]/i];

export const sharedPlaceholderContent: RuleCheck = {
  id: "shared.placeholder-content",
  run({ project }) {
    const code = appCodeFiles(project);
    const assets = project.files.filter((f) => /(^|\/)(assets|res\/values|l10n|i18n|locales?)\/.*\.(json|arb|xml|strings)$/.test(f) && !/(^|\/)node_modules\//.test(f));
    if (!code.length && !assets.length) return { skip: "no app sources found" };
    const findings: DraftFinding[] = [];

    for (const t of TEMPLATES.filter((t) => t.framework === project.framework)) {
      const m = searchFiles(project, code, t.patterns, 3);
      if (m.length) {
        findings.push({
          status: "warn",
          severity: "high",
          confidence: "medium",
          title: `App still contains the ${t.label}`,
          explanation: "Template screens indicate the app may be incomplete. Apple rejects incomplete apps (Guideline 2.1) and apps with minimal functionality (4.2); Google Play has a similar minimum functionality policy.",
          evidence: matchEvidence(m, "Template text"),
          recommendation: "Remove the template screen and make sure the release build opens to real app content.",
          key: `template#${t.framework}`,
        });
      }
    }
    const lorem = searchFiles(project, [...code, ...assets], LOREM, 5);
    if (lorem.length) {
      findings.push({
        status: "warn",
        severity: "medium",
        confidence: "medium",
        title: "Lorem ipsum placeholder text found",
        explanation: "Placeholder text in shipped screens is a common App Completeness rejection reason. Matches in unused code or tests are harmless.",
        evidence: matchEvidence(lorem, "Placeholder text"),
        recommendation: "Replace placeholder text with final copy, or confirm these strings are not reachable in the release build.",
        key: "lorem",
      });
    }
    const unfinished = searchFiles(project, code, UNFINISHED, 5);
    if (unfinished.length) {
      findings.push({
        status: "needs_review",
        severity: "low",
        confidence: "low",
        title: "Unfinished-feature labels found",
        explanation: "Labels such as “Coming soon” suggest features that reviewers cannot use. Reviewers may treat visible placeholders as incomplete functionality.",
        evidence: matchEvidence(unfinished, "Unfinished feature label"),
        recommendation: "Hide unfinished features in release builds (feature flags) rather than showing placeholder screens or buttons.",
        key: "unfinished",
      });
    }
    for (const m of project.androidManifests()) {
      const label = m.manifest.application?.["android:label"];
      if (label && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(label)) {
        findings.push({
          status: "warn",
          severity: "low",
          confidence: "medium",
          platform: "android",
          title: `Launcher label looks like a package name ("${label}")`,
          explanation: "Project templates set the launcher label to the project's snake_case name; it is what users see under the icon.",
          evidence: [{ file: m.path, line: lineOf(m.raw, "android:label"), key: "android:label", value: label, description: "<application android:label>" }],
          recommendation: "Set android:label to the app's display name (or a @string resource).",
          key: `label#${m.path}`,
        });
      }
    }
    return { findings, checked: `${code.length} source file(s) and ${assets.length} string/asset file(s) scanned` };
  },
};
