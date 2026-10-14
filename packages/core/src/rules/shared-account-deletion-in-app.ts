import type { DraftFinding, Evidence } from "../findings/types.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { accountSignals, matchEvidence } from "./signals.js";

export const sharedAccountDeletionInApp: RuleCheck = {
  id: "shared.account-deletion-in-app",
  run({ project }) {
    const s = accountSignals(project);
    if (s.declared === false) return { skip: "app.has_account_creation is false in .release-doctor.yml" };

    const creationEvidence: Evidence[] = [
      ...(s.declared === true ? [{ file: project.configFile ? ".release-doctor.yml" : undefined, key: "app.has_account_creation", value: "true", description: "Declared by the developer" }] : []),
      ...s.authDependencies,
      ...matchEvidence(s.signupEvidence, "Sign-up / registration signal", 3),
    ];
    const declaredPath = project.config.app.account_deletion.in_app_path;
    const findings: DraftFinding[] = [];

    if (!s.likelyCreatesAccounts) {
      findings.push({
        status: "needs_review",
        severity: "low",
        confidence: "low",
        title: "Account creation could not be determined",
        explanation:
          "No authentication SDK or sign-up flow was found, so the scanner cannot tell whether account deletion is required. Absence of evidence is not proof that the app has no accounts (for example, accounts created through a web view or a custom backend).",
        evidence: [{ description: "No auth dependency, sign-up call or sign-up label found in app sources" }],
        recommendation: "Set app.has_account_creation in .release-doctor.yml. If the app lets users create accounts, it must offer in-app account deletion.",
        key: "unknown",
      });
      return { findings };
    }

    if (s.deletionEvidence.length) {
      findings.push({
        status: "needs_review",
        severity: "info",
        confidence: "low",
        title: "Account deletion flow found – verify it end to end",
        explanation:
          "Code that looks like account deletion was found. Keyword matches do not prove the flow is reachable from the UI, deletes the account (not just signs out or deactivates), or removes associated data.",
        evidence: [...matchEvidence(s.deletionEvidence, "Deletion signal", 3), ...creationEvidence.slice(0, 2)],
        recommendation:
          "Walk through the flow on a release build: it should be easy to find (e.g. Settings > Account), start deletion in the app, and delete server-side data unless retention is legally required.",
        key: "found",
      });
    } else if (declaredPath) {
      findings.push({
        status: "needs_review",
        severity: "info",
        confidence: "low",
        title: "Declared account deletion path not found in code",
        explanation: `The developer declared the deletion path "${declaredPath}", but the scanner found no matching code. The flow may be implemented in a way the scanner does not recognize (web view, backend-driven UI).`,
        evidence: [{ file: ".release-doctor.yml", key: "app.account_deletion.in_app_path", value: declaredPath, description: "Developer declaration" }, ...creationEvidence.slice(0, 2)],
        recommendation: "Confirm the path exists in the release build and include it in the App Review notes.",
        key: "declared",
      });
    } else {
      findings.push({
        status: "warn",
        severity: "high",
        confidence: "medium",
        title: "App appears to create accounts but no in-app deletion flow was found",
        explanation:
          "Both Apple (Guideline 5.1.1(v)) and Google Play require apps that support account creation to let users initiate account deletion from within the app. The scanner found account-creation signals but no deletion flow.",
        evidence: creationEvidence,
        recommendation:
          "Add a clearly labelled “Delete account” action (e.g. in Settings > Account) that deletes the account and associated data, then record the path in .release-doctor.yml (app.account_deletion.in_app_path).",
        key: "missing",
      });
    }
    return { findings };
  },
};
