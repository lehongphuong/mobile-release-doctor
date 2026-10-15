import type { RuleCheck } from "../rules-engine/types.js";
import { applePermissionPurposeString } from "./apple-permission-purpose-string.js";
import { appleRequiredReasonApi } from "./apple-required-reason-api.js";
import { googleAccountDeletionWeb } from "./google-account-deletion-web.js";
import { googleSensitivePermissions } from "./google-sensitive-permissions.js";
import { googleTargetApiLevel } from "./google-target-api-level.js";
import { sharedAccountDeletionInApp } from "./shared-account-deletion-in-app.js";
import { sharedAppIdentifier } from "./shared-app-identifier.js";
import { sharedDebugConfiguration } from "./shared-debug-configuration.js";
import { sharedEmbeddedSecrets } from "./shared-embedded-secrets.js";
import { sharedPermissionUsageEvidence } from "./shared-permission-usage-evidence.js";
import { sharedPlaceholderContent } from "./shared-placeholder-content.js";
import { sharedPrivacyPolicy } from "./shared-privacy-policy.js";
import { sharedReleaseVersion } from "./shared-release-version.js";
import { sharedReviewAccess } from "./shared-review-access.js";

export const RULE_CHECKS: RuleCheck[] = [
  applePermissionPurposeString,
  appleRequiredReasonApi,
  googleAccountDeletionWeb,
  googleSensitivePermissions,
  googleTargetApiLevel,
  sharedAccountDeletionInApp,
  sharedAppIdentifier,
  sharedDebugConfiguration,
  sharedEmbeddedSecrets,
  sharedPermissionUsageEvidence,
  sharedPlaceholderContent,
  sharedPrivacyPolicy,
  sharedReleaseVersion,
  sharedReviewAccess,
];

export function checkRegistry(): Map<string, RuleCheck> {
  return new Map(RULE_CHECKS.map((c) => [c.id, c]));
}
