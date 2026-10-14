import { z } from "zod";

export const PLATFORMS = ["ios", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const FRAMEWORKS = ["flutter", "react-native", "expo", "native-ios", "native-android"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

/**
 * Severity describes how much a finding matters if it is real.
 * Ordered from most to least severe.
 */
export const SEVERITIES = ["error", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Status describes how certain the scanner is.
 * - fail: clear evidence of a violation or technical defect.
 * - warn: a signal that something is off, not enough to conclude.
 * - needs_review: cannot be verified automatically; a human must check.
 * - info: reminder or improvement suggestion.
 */
export const FINDING_STATUSES = ["fail", "warn", "needs_review", "info"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const VERIFICATION_LEVELS = [
  "deterministic",
  "config-parse",
  "source-heuristic",
  "developer-declared",
  "manual",
] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const RULE_OUTCOMES = ["pass", "fail", "warn", "needs_review", "info", "skip", "error"] as const;
export type RuleOutcome = (typeof RULE_OUTCOMES)[number];

export const evidenceSchema = z
  .object({
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
    key: z.string().optional(),
    value: z.string().optional(),
    description: z.string().min(1),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;

export const referenceSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
  })
  .strict();
export type PolicyReference = z.infer<typeof referenceSchema>;

export const findingSchema = z
  .object({
    rule_id: z.string().min(1),
    rule_version: z.string().min(1),
    platform: z.enum([...PLATFORMS, "all"]),
    framework: z.enum(FRAMEWORKS),
    status: z.enum(FINDING_STATUSES),
    severity: z.enum(SEVERITIES),
    confidence: z.enum(CONFIDENCES),
    title: z.string().min(1),
    explanation: z.string().min(1),
    evidence: z.array(evidenceSchema),
    recommendation: z.string().min(1),
    references: z.array(referenceSchema).min(1),
    verification: z.enum(VERIFICATION_LEVELS),
    fingerprint: z.string().min(1),
  })
  .strict();
export type Finding = z.infer<typeof findingSchema>;

/** What a rule check returns before the engine enriches it with rule metadata. */
export interface DraftFinding {
  status: FindingStatus;
  severity?: Severity;
  confidence?: Confidence;
  platform?: Platform | "all";
  title?: string;
  explanation: string;
  evidence: Evidence[];
  recommendation?: string;
  /** Stable discriminator so the same issue gets the same fingerprint across scans. */
  key?: string;
  /** Narrow the references to these policy source ids (must be listed in the rule's policy_references). */
  referenceIds?: string[];
}

export interface Diagnostic {
  level: "error" | "warning" | "info";
  file?: string;
  message: string;
}

export function severityRank(s: Severity): number {
  return SEVERITIES.length - SEVERITIES.indexOf(s);
}

export function isAtLeast(s: Severity, threshold: Severity): boolean {
  return severityRank(s) >= severityRank(threshold);
}
