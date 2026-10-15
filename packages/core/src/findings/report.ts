import type { EngineResult, RuleResult, SuppressedFinding } from "../rules-engine/engine.js";
import type { Diagnostic, Finding, FindingStatus, Framework, Platform, Severity } from "./types.js";
import { FINDING_STATUSES, isAtLeast, SEVERITIES } from "./types.js";

export const DISCLAIMER =
  "Automated checks cannot guarantee App Store or Google Play approval. Passing rules mean no issue was detected with the available evidence; items marked needs_review require a human decision.";

export type Readiness = "blocking-issues" | "issues-to-verify" | "manual-review-needed" | "no-issues-detected";

export interface Comparison {
  baseline_scanned_at?: string;
  resolved: { fingerprint: string; rule_id: string; title: string }[];
  new: { fingerprint: string; rule_id: string; title: string }[];
  unchanged: number;
}

export interface Report {
  schema_version: string;
  tool: { name: string; version: string };
  scanned_at: string;
  evaluation_date: string;
  project: {
    name: string;
    framework: Framework;
    platforms: Platform[];
    detection_signals: string[];
    config_file?: string;
    files_scanned: number;
  };
  options: {
    platform: Platform | "all";
    rules?: string[];
    min_severity?: Severity;
    fail_on: Severity;
    offline: true;
    ai: false;
  };
  catalog: {
    rule_count: number;
    policy_sources_version: string;
    policy_snapshot: { version: string; verified_on: string; review_by: string; stale: boolean };
  };
  summary: {
    readiness: Readiness;
    headline: string;
    by_status: Record<FindingStatus, number>;
    by_severity: Record<Severity, number>;
    rules: Record<RuleResult["outcome"], number>;
    threshold_exceeded: boolean;
    hidden_below_severity: number;
    suppressed: number;
  };
  findings: Finding[];
  rule_results: RuleResult[];
  suppressed: SuppressedFinding[];
  diagnostics: Diagnostic[];
  comparison?: Comparison;
  disclaimer: string;
}

export function thresholdExceeded(findings: Finding[], failOn: Severity): boolean {
  return findings.some((f) => (f.status === "fail" || f.status === "warn") && isAtLeast(f.severity, failOn));
}

export function readinessOf(findings: Finding[]): { readiness: Readiness; headline: string } {
  const blocking = findings.filter((f) => f.status === "fail");
  const risks = findings.filter((f) => f.status === "warn" && isAtLeast(f.severity, "medium"));
  const review = findings.filter((f) => f.status === "needs_review" || (f.status === "warn" && !isAtLeast(f.severity, "medium")));
  if (blocking.length)
    return { readiness: "blocking-issues", headline: `${blocking.length} issue(s) with clear evidence must be fixed before release` };
  if (risks.length) return { readiness: "issues-to-verify", headline: `${risks.length} risk(s) need to be fixed or verified before release` };
  if (review.length) return { readiness: "manual-review-needed", headline: `${review.length} item(s) need manual review; no blocking issue detected` };
  return { readiness: "no-issues-detected", headline: "No issues detected by automated checks" };
}

export function compare(current: Finding[], baseline: Pick<Report, "findings" | "scanned_at">): Comparison {
  const before = new Map(baseline.findings.map((f) => [f.fingerprint, f]));
  const now = new Map(current.map((f) => [f.fingerprint, f]));
  const pick = (f: Finding) => ({ fingerprint: f.fingerprint, rule_id: f.rule_id, title: f.title });
  return {
    baseline_scanned_at: baseline.scanned_at,
    resolved: [...before.values()].filter((f) => !now.has(f.fingerprint)).map(pick),
    new: [...now.values()].filter((f) => !before.has(f.fingerprint)).map(pick),
    unchanged: [...now.keys()].filter((k) => before.has(k)).length,
  };
}

export function countBy<T extends string>(keys: readonly T[], values: T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const v of values) out[v]++;
  return out;
}

export function summarize(result: EngineResult, failOn: Severity) {
  return {
    ...readinessOf(result.findings),
    by_status: countBy(FINDING_STATUSES, result.findings.map((f) => f.status)),
    by_severity: countBy(SEVERITIES, result.findings.map((f) => f.severity)),
    rules: countBy(["pass", "fail", "warn", "needs_review", "info", "skip", "error"] as const, result.ruleResults.map((r) => r.outcome)),
    threshold_exceeded: thresholdExceeded(result.findings, failOn),
    hidden_below_severity: result.hiddenBelowSeverity,
    suppressed: result.suppressed.length,
  };
}
