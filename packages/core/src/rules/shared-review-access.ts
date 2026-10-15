import type { DraftFinding } from "../findings/types.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { accountSignals, matchEvidence } from "./signals.js";

export const sharedReviewAccess: RuleCheck = {
  id: "shared.review-access",
  run({ project }) {
    const app = project.config.app;
    const s = accountSignals(project);
    if (app.requires_login_for_review === false) return { skip: "app.requires_login_for_review is false in .release-doctor.yml" };
    if (app.requires_login_for_review === "unknown" && !s.likelyCreatesAccounts) return { skip: "no login or account signals found" };

    const findings: DraftFinding[] = [];
    if (app.requires_login_for_review === true && app.review_demo_account_provided !== true) {
      findings.push({
        status: "warn",
        severity: "high",
        confidence: "medium",
        title: "Login is required but no demo account is confirmed for reviewers",
        explanation:
          "Reviewers must be able to reach every account-based feature. Apple asks for an active demo account or a full demo mode (Guideline 2.1), and Play Console's App access section needs working credentials; missing or expired credentials are a frequent rejection reason.",
        evidence: [{ file: ".release-doctor.yml", key: "app.review_demo_account_provided", value: String(app.review_demo_account_provided ?? "not set"), description: "Developer declaration" }],
        recommendation:
          "Create a demo account that does not expire and does not need 2FA on a personal device, test it on a release build, and enter it in App Store Connect (App Review Information) and Play Console (App content > App access). Then set review_demo_account_provided: true.",
        key: "missing-demo",
      });
    } else if (app.requires_login_for_review === "unknown") {
      findings.push({
        status: "needs_review",
        severity: "medium",
        confidence: "low",
        title: "Confirm reviewers can sign in",
        explanation: "The app appears to have accounts. If any feature requires signing in, reviewers need working credentials or a demo mode.",
        evidence: [...s.authDependencies.slice(0, 2), ...matchEvidence(s.signupEvidence, "Sign-up / login signal", 2)],
        recommendation: "Set app.requires_login_for_review and app.review_demo_account_provided in .release-doctor.yml after preparing the reviewer account.",
        key: "unknown",
      });
    }
    return { findings, checked: "developer confirmed a demo account for reviewers" };
  },
};
