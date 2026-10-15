import { createHash } from "node:crypto";
import type { ProjectContext } from "../analyzer/project.js";
import { globToRegExp } from "../analyzer/walk.js";
import { redactText } from "../findings/redact.js";
import {
  FINDING_STATUSES,
  findingSchema,
  isAtLeast,
  SEVERITIES,
  type Diagnostic,
  type DraftFinding,
  type Finding,
  type Platform,
  type RuleOutcome,
  type Severity,
} from "../findings/types.js";
import type { Catalog, LoadedRule } from "./loader.js";
import type { RuleCheck } from "./types.js";

export interface EngineOptions {
  platform: Platform | "all";
  /** Only run these rule ids (all when empty). */
  ruleIds?: string[];
  /** Hide findings below this severity from the report (rules still run). */
  minSeverity?: Severity;
}

export interface RuleResult {
  rule_id: string;
  rule_version: string;
  title: string;
  outcome: RuleOutcome;
  reason?: string;
  finding_count: number;
}

export interface SuppressedFinding {
  rule_id: string;
  fingerprint: string;
  title: string;
  reason: string;
}

export interface EngineResult {
  findings: Finding[];
  ruleResults: RuleResult[];
  suppressed: SuppressedFinding[];
  hiddenBelowSeverity: number;
  diagnostics: Diagnostic[];
}

export class RuleContractError extends Error {}

const STATUS_ORDER = FINDING_STATUSES; // fail, warn, needs_review, info

function fingerprint(ruleId: string, d: DraftFinding): string {
  const basis = d.key ?? d.evidence.map((e) => `${e.file ?? ""}|${e.key ?? ""}`).join(";") ?? "";
  return createHash("sha256").update(`${ruleId}\n${basis}`).digest("hex").slice(0, 12);
}

function sanitize(d: DraftFinding): DraftFinding {
  return {
    ...d,
    explanation: redactText(d.explanation),
    evidence: d.evidence.map((e) => ({
      ...e,
      description: redactText(e.description),
      value: e.value === undefined ? undefined : redactText(e.value),
    })),
  };
}

function enforceContract(rule: LoadedRule, d: DraftFinding): void {
  const meta = rule.meta;
  if (!meta.allowed_statuses.includes(d.status)) {
    throw new RuleContractError(`${meta.id} emitted status "${d.status}", allowed: ${meta.allowed_statuses.join(", ")}`);
  }
  const sev = d.severity ?? meta.severity;
  if (SEVERITIES.indexOf(sev) < SEVERITIES.indexOf(meta.max_severity)) {
    throw new RuleContractError(`${meta.id} emitted severity "${sev}" above max_severity "${meta.max_severity}"`);
  }
}

function resolveReferences(rule: LoadedRule, ids: string[]) {
  const refs = ids.map((id) => {
    const r = rule.references.find((x) => x.id === id);
    if (!r) throw new RuleContractError(`${rule.meta.id} cited ${id}, which is not in its policy_references`);
    return r;
  });
  return refs.length ? refs : rule.references;
}

function isSuppressed(project: ProjectContext, ruleId: string, f: Finding): string | undefined {
  for (const ig of project.config.ignore) {
    if (ig.rule !== ruleId && ig.rule !== "*") continue;
    if (!ig.path) return ig.reason;
    const re = globToRegExp(ig.path);
    if (f.evidence.some((e) => e.file && re.test(e.file))) return ig.reason;
  }
  return undefined;
}

export function selectRules(catalog: Catalog, project: ProjectContext, opts: EngineOptions) {
  const selected: { rule: LoadedRule; skip?: string }[] = [];
  for (const rule of catalog.rules) {
    const m = rule.meta;
    if (opts.ruleIds?.length && !opts.ruleIds.includes(m.id)) continue;
    if (m.deprecated_in) {
      selected.push({ rule, skip: `deprecated in ${m.deprecated_in}` });
      continue;
    }
    const wanted = opts.platform === "all" ? project.platforms : project.platforms.filter((p) => p === opts.platform);
    if (opts.platform !== "all" && !m.platforms.includes(opts.platform)) continue;
    if (!m.platforms.some((p) => wanted.includes(p))) {
      selected.push({ rule, skip: `project has no ${m.platforms.join("/")} target` });
      continue;
    }
    if (!m.frameworks.includes(project.framework)) {
      selected.push({ rule, skip: `not implemented for ${project.framework}` });
      continue;
    }
    selected.push({ rule });
  }
  return selected;
}

export function runRules(
  catalog: Catalog,
  checks: Map<string, RuleCheck>,
  project: ProjectContext,
  opts: EngineOptions,
): EngineResult {
  const findings: Finding[] = [];
  const ruleResults: RuleResult[] = [];
  const suppressed: SuppressedFinding[] = [];
  let hidden = 0;

  for (const { rule, skip } of selectRules(catalog, project, opts)) {
    const meta = rule.meta;
    const base = { rule_id: meta.id, rule_version: meta.version, title: meta.title };
    if (skip) {
      ruleResults.push({ ...base, outcome: "skip", reason: skip, finding_count: 0 });
      continue;
    }
    const check = checks.get(meta.id);
    if (!check) {
      ruleResults.push({ ...base, outcome: "error", reason: "no implementation registered", finding_count: 0 });
      project.diagnostics.push({ level: "error", message: `rule ${meta.id} has no implementation` });
      continue;
    }
    let result;
    try {
      result = check.run({ project, policy: catalog.policy, rule: meta });
    } catch (e) {
      ruleResults.push({ ...base, outcome: "error", reason: (e as Error).message, finding_count: 0 });
      project.diagnostics.push({ level: "error", message: `rule ${meta.id} crashed: ${(e as Error).message}` });
      continue;
    }
    if ("skip" in result) {
      ruleResults.push({ ...base, outcome: "skip", reason: result.skip, finding_count: 0 });
      continue;
    }

    const ruleFindings: Finding[] = [];
    try {
      for (const raw of result.findings) {
        enforceContract(rule, raw);
        const d = sanitize(raw);
        const platform = d.platform ?? (meta.platforms.length === 1 ? meta.platforms[0]! : "all");
        const finding: Finding = {
          rule_id: meta.id,
          rule_version: meta.version,
          platform,
          framework: project.framework,
          status: d.status,
          severity: d.severity ?? meta.severity,
          confidence: d.confidence ?? "medium",
          title: d.title ?? meta.title,
          explanation: d.explanation,
          evidence: d.evidence,
          recommendation: d.recommendation ?? meta.recommendation.trim(),
          references: d.referenceIds ? resolveReferences(rule, d.referenceIds) : rule.references,
          verification: meta.verification.level,
          fingerprint: fingerprint(meta.id, d),
        };
        const parsed = findingSchema.safeParse(finding);
        if (!parsed.success) {
          throw new RuleContractError(`${meta.id} produced an invalid finding: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
        }
        ruleFindings.push(parsed.data);
      }
    } catch (e) {
      ruleResults.push({ ...base, outcome: "error", reason: (e as Error).message, finding_count: 0 });
      project.diagnostics.push({ level: "error", message: (e as Error).message });
      continue;
    }

    const kept: Finding[] = [];
    const seen = new Set<string>();
    for (const f of ruleFindings) {
      if (seen.has(f.fingerprint)) continue;
      if (opts.platform !== "all" && f.platform !== "all" && f.platform !== opts.platform) continue;
      seen.add(f.fingerprint);
      const reason = isSuppressed(project, meta.id, f);
      if (reason) suppressed.push({ rule_id: meta.id, fingerprint: f.fingerprint, title: f.title, reason });
      else kept.push(f);
    }
    const worst = STATUS_ORDER.find((s) => kept.some((f) => f.status === s));
    ruleResults.push({
      ...base,
      outcome: worst ?? "pass",
      reason: worst ? undefined : result.checked,
      finding_count: kept.length,
    });
    for (const f of kept) {
      if (opts.minSeverity && !isAtLeast(f.severity, opts.minSeverity)) hidden++;
      else findings.push(f);
    }
  }

  findings.sort(
    (a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.rule_id.localeCompare(b.rule_id) ||
      a.fingerprint.localeCompare(b.fingerprint),
  );
  return { findings, ruleResults, suppressed, hiddenBelowSeverity: hidden, diagnostics: project.diagnostics };
}
