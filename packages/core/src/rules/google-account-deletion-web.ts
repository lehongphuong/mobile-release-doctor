import type { DraftFinding } from "../findings/types.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { accountSignals, isPlaceholderUrl, matchEvidence } from "./signals.js";

export const googleAccountDeletionWeb: RuleCheck = {
  id: "google.account-deletion-web",
  run({ project }) {
    const s = accountSignals(project);
    if (s.declared === false) return { skip: "app.has_account_creation is false in .release-doctor.yml" };
    if (!s.likelyCreatesAccounts) return { skip: "account creation not detected; see shared.account-deletion-in-app" };
    const url = project.config.app.account_deletion.web_url;
    const findings: DraftFinding[] = [];
    if (!url) {
      findings.push({
        status: "warn",
        severity: "high",
        confidence: "medium",
        title: "No web account deletion URL declared",
        explanation:
          "Google Play requires apps that allow account creation to provide a web link where users can request account and data deletion without reinstalling the app. The link is entered in the Data safety form; the scanner cannot see Play Console, so it relies on your declaration.",
        evidence: [
          ...s.authDependencies.slice(0, 2),
          ...matchEvidence(s.signupEvidence, "Sign-up signal", 2),
          { file: ".release-doctor.yml", key: "app.account_deletion.web_url", description: "Not declared" },
        ],
        recommendation:
          "Publish a page that explains how to request deletion (and what data is deleted or retained), enter it in Play Console > App content > Data safety, and record it as app.account_deletion.web_url.",
        key: "missing",
      });
    } else if (!url.startsWith("https://") || isPlaceholderUrl(url)) {
      findings.push({
        status: "warn",
        severity: "high",
        confidence: "high",
        title: "Account deletion URL looks invalid or like a placeholder",
        explanation: `The declared URL "${url}" is not an HTTPS URL on a real domain.`,
        evidence: [{ file: ".release-doctor.yml", key: "app.account_deletion.web_url", value: url, description: "Declared URL" }],
        recommendation: "Use the public HTTPS page where users can request deletion.",
        key: "invalid",
      });
    }
    return { findings, checked: url ? `web deletion URL declared: ${url} (not fetched; scans are offline)` : undefined };
  },
};
