import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { ConfigError, ProjectContext } from "./analyzer/project.js";
import { detectFramework, findCandidateProjects, type Detection } from "./analyzer/detect.js";
import { compare, DISCLAIMER, summarize, type Report } from "./findings/report.js";
import type { Framework, Platform, Severity } from "./findings/types.js";
import { checkRegistry } from "./rules/index.js";
import { runRules } from "./rules-engine/engine.js";
import { loadCatalog, type Catalog } from "./rules-engine/loader.js";
import { policyDataFileSchema } from "./rules-engine/schema.js";
import { REPORT_SCHEMA_VERSION, TOOL_NAME, TOOL_VERSION } from "./version.js";

export interface ScanOptions {
  project: string;
  platform?: Platform | "all";
  framework?: Framework | "auto";
  rules?: string[];
  minSeverity?: Severity;
  failOn?: Severity;
  /** Evaluation date (YYYY-MM-DD) for time-dependent policy; defaults to today. */
  date?: string;
  configPath?: string;
  /** Alternative policy-data.yaml (pinned snapshot). */
  policySnapshot?: string;
  baseline?: Report;
  catalog?: Catalog;
  /** Override scanned_at (tests). */
  scannedAt?: string;
  useGit?: boolean;
}

/** Errors the CLI maps to exit codes. */
export class ScanInputError extends Error {
  constructor(message: string, readonly exitCode: 2 | 4 = 2) {
    super(message);
  }
}

function detectionFor(root: string, forced?: Framework | "auto"): Detection {
  const auto = detectFramework(root);
  if (forced && forced !== "auto") {
    return { framework: forced, platforms: auto?.platforms ?? (forced === "native-ios" ? ["ios"] : forced === "native-android" ? ["android"] : ["ios", "android"]), signals: [`framework forced with --framework ${forced}`] };
  }
  if (auto) return auto;
  const candidates = findCandidateProjects(root);
  const hint = candidates.length
    ? ` Found ${candidates.length} project(s) below it: ${candidates.map((c) => `${c.path} (${c.framework})`).join(", ")}. Re-run with --project <path>.`
    : "";
  throw new ScanInputError(`No supported mobile project at ${root}.${hint}`);
}

export function scan(opts: ScanOptions): Report {
  const root = resolve(opts.project);
  const detection = detectionFor(root, opts.framework);
  const platform = opts.platform ?? "all";
  if (platform !== "all" && !detection.platforms.includes(platform)) {
    throw new ScanInputError(`--platform ${platform} was requested but the project has no ${platform} target (found: ${detection.platforms.join(", ") || "none"}).`, 4);
  }
  const now = opts.date ? new Date(`${opts.date}T00:00:00Z`) : new Date();
  if (Number.isNaN(now.getTime())) throw new ScanInputError(`invalid --date ${opts.date}`);

  let catalog = opts.catalog ?? loadCatalog();
  if (opts.policySnapshot) {
    const parsed = policyDataFileSchema.safeParse(parseYaml(readFileSync(opts.policySnapshot, "utf8")));
    if (!parsed.success) throw new ScanInputError(`invalid policy snapshot ${opts.policySnapshot}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    catalog = { ...catalog, policy: parsed.data };
  }
  if (opts.rules?.length) {
    const unknown = opts.rules.filter((r) => !catalog.rules.some((x) => x.meta.id === r));
    if (unknown.length) throw new ScanInputError(`unknown rule id(s): ${unknown.join(", ")}`);
  }

  let project: ProjectContext;
  try {
    // Rules see only the selected platform, so shared rules skip the other one.
    const scoped = platform === "all" ? detection : { ...detection, platforms: [platform] };
    project = new ProjectContext({ root, detection: scoped, now, configPath: opts.configPath, useGit: opts.useGit });
  } catch (e) {
    if (e instanceof ConfigError) throw new ScanInputError(e.message);
    throw e;
  }
  const failOn = opts.failOn ?? project.config.fail_on;
  const result = runRules(catalog, checkRegistry(), project, { platform, ruleIds: opts.rules, minSeverity: opts.minSeverity });
  const evaluationDate = now.toISOString().slice(0, 10);

  const report: Report = {
    schema_version: REPORT_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    scanned_at: opts.scannedAt ?? new Date().toISOString(),
    evaluation_date: evaluationDate,
    project: {
      name: project.pubspec()?.name ?? (project.packageJson()?.["name"] as string | undefined) ?? basename(root),
      framework: project.framework,
      platforms: detection.platforms,
      detection_signals: project.detectionSignals,
      config_file: project.configFile ? basename(project.configFile) : undefined,
      files_scanned: project.files.length,
    },
    options: { platform, rules: opts.rules, min_severity: opts.minSeverity, fail_on: failOn, offline: true, ai: false },
    catalog: {
      rule_count: catalog.rules.length,
      policy_sources_version: catalog.sourcesVersion,
      policy_snapshot: {
        version: catalog.policy.snapshot_version,
        verified_on: catalog.policy.verified_on,
        review_by: catalog.policy.review_by,
        stale: evaluationDate > catalog.policy.review_by,
      },
    },
    summary: { ...summarize(result, failOn) },
    findings: result.findings,
    rule_results: result.ruleResults,
    suppressed: result.suppressed,
    diagnostics: result.diagnostics,
    disclaimer: DISCLAIMER,
  };
  if (opts.baseline) report.comparison = compare(result.findings, opts.baseline);
  return report;
}
