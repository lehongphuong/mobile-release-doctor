import { z } from "zod";
import {
  FINDING_STATUSES,
  FRAMEWORKS,
  PLATFORMS,
  SEVERITIES,
  VERIFICATION_LEVELS,
} from "../findings/types.js";

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "must be a semver version like 0.1.0");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date like 2026-10-14");

export const ruleMetadataSchema = z
  .object({
    id: z.string().regex(/^(apple|google|shared)\.[a-z0-9]+(?:-[a-z0-9]+)*$/, "rule ids look like apple.some-check"),
    version: semver,
    title: z.string().min(5),
    description: z.string().min(10),
    platforms: z.array(z.enum(PLATFORMS)).min(1),
    frameworks: z.array(z.enum(FRAMEWORKS)).min(1),
    category: z.enum([
      "privacy",
      "permissions",
      "account-lifecycle",
      "build-configuration",
      "security",
      "app-completeness",
      "store-metadata",
    ]),
    /** Default severity applied when a check does not set one. */
    severity: z.enum(SEVERITIES),
    /** The engine refuses findings more severe than this. */
    max_severity: z.enum(SEVERITIES),
    /** The engine refuses findings with any other status. */
    allowed_statuses: z.array(z.enum(FINDING_STATUSES)).min(1),
    /**
     * verified: an official source states the requirement clearly.
     * needs-research: the requirement or its detection logic still needs confirmation.
     */
    requirement_status: z.enum(["verified", "needs-research"]),
    verification: z
      .object({
        level: z.enum(VERIFICATION_LEVELS),
        last_verified: isoDate,
      })
      .strict(),
    policy_references: z.array(z.string().min(1)).min(1),
    applies_when: z.array(z.string()).default([]),
    recommendation: z.string().min(10),
    limitations: z.array(z.string()).default([]),
    introduced_in: semver,
    deprecated_in: semver.nullable().default(null),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (SEVERITIES.indexOf(rule.severity) < SEVERITIES.indexOf(rule.max_severity)) {
      ctx.addIssue({ code: "custom", message: "severity must not exceed max_severity", path: ["severity"] });
    }
    if (rule.requirement_status === "needs-research" && rule.allowed_statuses.includes("fail")) {
      ctx.addIssue({
        code: "custom",
        message: "rules whose requirement still needs research may not emit fail",
        path: ["allowed_statuses"],
      });
    }
    if (rule.verification.level === "source-heuristic" && rule.allowed_statuses.includes("fail")) {
      ctx.addIssue({
        code: "custom",
        message: "source heuristics are not proof; use warn or needs_review instead of fail",
        path: ["allowed_statuses"],
      });
    }
  });
export type RuleMetadata = z.infer<typeof ruleMetadataSchema>;

export const policySourceSchema = z
  .object({
    id: z.string().min(1),
    authority: z.enum(["apple", "google"]),
    title: z.string().min(1),
    url: z.string().url().startsWith("https://"),
    /** Date the URL was last fetched and the requirement re-read; null when it has not been fetched yet. */
    last_checked: isoDate.nullable(),
  })
  .strict();
export type PolicySource = z.infer<typeof policySourceSchema>;

export const policySourcesFileSchema = z
  .object({
    snapshot_version: z.string().min(1),
    sources: z.array(policySourceSchema).min(1),
  })
  .strict();

export const targetApiRequirementSchema = z
  .object({
    effective_from: isoDate,
    min_target_sdk: z.number().int().positive(),
    applies_to: z.enum(["new-apps-and-updates", "new-apps", "updates"]),
    form_factor: z.enum(["phone-tablet", "wear-os", "android-tv", "automotive"]),
    source: z.string().min(1),
    note: z.string().optional(),
  })
  .strict();

export const policyDataFileSchema = z
  .object({
    snapshot_version: z.string().min(1),
    verified_on: isoDate,
    /** After this date the snapshot is considered stale and time-sensitive rules downgrade to needs_review. */
    review_by: isoDate,
    google_target_api: z.array(targetApiRequirementSchema).min(1),
  })
  .strict();
export type PolicyData = z.infer<typeof policyDataFileSchema>;
export type TargetApiRequirement = z.infer<typeof targetApiRequirementSchema>;
