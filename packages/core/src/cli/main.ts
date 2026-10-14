import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Report } from "../findings/report.js";
import { FRAMEWORKS, PLATFORMS, SEVERITIES, type Framework, type Platform, type Severity } from "../findings/types.js";
import { renderJson } from "../reporters/json.js";
import { renderMarkdown } from "../reporters/markdown.js";
import { renderText } from "../reporters/text.js";
import { checkRegistry } from "../rules/index.js";
import { loadCatalog, RuleValidationError } from "../rules-engine/loader.js";
import { scan, ScanInputError } from "../scan.js";
import { TOOL_VERSION } from "../version.js";

export const EXIT = { OK: 0, THRESHOLD: 1, INPUT: 2, ENGINE: 3, INSUFFICIENT: 4 } as const;

const HELP = `mobile-release-doctor ${TOOL_VERSION}
Read-only, offline scanner for mobile release risks (App Store / Google Play).

Usage: node scan.mjs [options]

  --project <path>          Project directory (default: .)
  --platform <p>            ios | android | all (default: all)
  --framework <f>           auto | ${FRAMEWORKS.join(" | ")} (default: auto)
  --format <f>              text | markdown | json (default: text)
  --output <file>           Write the report to a file (format from --format)
  --json-output <file>      Also write the JSON report to this file
  --rules <ids>             Comma-separated rule ids to run
  --severity <s>            Hide findings below: ${SEVERITIES.join(" | ")}
  --strict                  Exit 1 when a fail/warn finding reaches --fail-on
  --fail-on <s>             Threshold for --strict (default: config fail_on or high)
  --baseline <report.json>  Compare with a previous JSON report (fix-and-rescan)
  --config <file>           Project config (default: <project>/.release-doctor.yml)
  --policy-snapshot <file>  Use a pinned policy-data.yaml
  --date <YYYY-MM-DD>       Evaluate time-dependent policies as of this date
  --offline                 Accepted for clarity; scans never use the network
  --no-ai                   Accepted for clarity; the scanner never calls AI services
  --list-rules              Print the rule catalog and exit
  --validate-rules          Validate rule metadata, policy data and implementations
  --no-color                Disable colors in text output
  --no-git                  Do not ask git which files are committed
  --version, --help

Exit codes: 0 completed (threshold not exceeded), 1 strict threshold exceeded,
2 invalid arguments/config/input, 3 scanner or rule error, 4 not enough data
for the requested check. Exit 0 never means the app will be approved.
`;

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new ScanInputError(`--${name} must be one of: ${allowed.join(", ")}`);
  return value as T;
}

function validateRules(): number {
  const catalog = loadCatalog();
  const checks = checkRegistry();
  const problems: string[] = [];
  for (const r of catalog.rules) if (!checks.has(r.meta.id)) problems.push(`${r.file}: no implementation registered for ${r.meta.id}`);
  for (const id of checks.keys()) if (!catalog.rules.some((r) => r.meta.id === id)) problems.push(`implementation ${id} has no rule metadata`);
  if (problems.length) throw new RuleValidationError(problems);
  process.stdout.write(`OK: ${catalog.rules.length} rules, ${catalog.sources.size} policy sources, policy snapshot ${catalog.policy.snapshot_version}\n`);
  return EXIT.OK;
}

export function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        project: { type: "string" },
        platform: { type: "string" },
        framework: { type: "string" },
        format: { type: "string" },
        output: { type: "string" },
        "json-output": { type: "string" },
        rules: { type: "string" },
        severity: { type: "string" },
        strict: { type: "boolean" },
        "fail-on": { type: "string" },
        baseline: { type: "string" },
        config: { type: "string" },
        "policy-snapshot": { type: "string" },
        date: { type: "string" },
        offline: { type: "boolean" },
        "no-ai": { type: "boolean" },
        "no-color": { type: "boolean" },
        "no-git": { type: "boolean" },
        "list-rules": { type: "boolean" },
        "validate-rules": { type: "boolean" },
        version: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${HELP}`);
    return EXIT.INPUT;
  }
  const v = args.values;
  if (v.help) {
    process.stdout.write(HELP);
    return EXIT.OK;
  }
  if (v.version) {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return EXIT.OK;
  }
  try {
    if (v["validate-rules"]) return validateRules();
    if (v["list-rules"]) {
      for (const r of loadCatalog().rules) {
        process.stdout.write(`${r.meta.id.padEnd(36)} ${r.meta.platforms.join("/").padEnd(12)} ${r.meta.requirement_status.padEnd(15)} ${r.meta.title}\n`);
      }
      return EXIT.OK;
    }
    const positional = args.positionals[0] === "scan" ? args.positionals.slice(1) : args.positionals;
    const format = oneOf("format", v.format, ["text", "markdown", "json"] as const) ?? "text";
    let baseline: Report | undefined;
    if (v.baseline) {
      try {
        baseline = JSON.parse(readFileSync(v.baseline, "utf8")) as Report;
        if (!Array.isArray(baseline.findings)) throw new Error("missing findings array");
      } catch (e) {
        throw new ScanInputError(`cannot read baseline ${v.baseline}: ${(e as Error).message}`);
      }
    }
    if (v.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw new ScanInputError("--date must be YYYY-MM-DD");
    const report = scan({
      project: v.project ?? positional[0] ?? ".",
      platform: oneOf<Platform | "all">("platform", v.platform, [...PLATFORMS, "all"]),
      framework: oneOf<Framework | "auto">("framework", v.framework, [...FRAMEWORKS, "auto"]),
      rules: v.rules?.split(",").map((s) => s.trim()).filter(Boolean),
      minSeverity: oneOf<Severity>("severity", v.severity, SEVERITIES),
      failOn: oneOf<Severity>("fail-on", v["fail-on"], SEVERITIES),
      date: v.date,
      configPath: v.config ? resolve(v.config) : undefined,
      policySnapshot: v["policy-snapshot"] ? resolve(v["policy-snapshot"]) : undefined,
      baseline,
      useGit: !v["no-git"],
    });
    const color = !v["no-color"] && !process.env["NO_COLOR"] && !v.output && process.stdout.isTTY === true;
    const rendered = format === "json" ? renderJson(report) : format === "markdown" ? renderMarkdown(report) : renderText(report, { color });
    if (v.output) {
      mkdirSync(dirname(resolve(v.output)), { recursive: true });
      writeFileSync(v.output, rendered);
      process.stderr.write(`Report written to ${v.output} — ${report.summary.headline}\n`);
    } else process.stdout.write(rendered);
    if (v["json-output"]) {
      mkdirSync(dirname(resolve(v["json-output"])), { recursive: true });
      writeFileSync(v["json-output"], renderJson(report));
    }
    if (report.rule_results.some((r) => r.outcome === "error")) return EXIT.ENGINE;
    if (v.strict && report.summary.threshold_exceeded) return EXIT.THRESHOLD;
    return EXIT.OK;
  } catch (e) {
    if (e instanceof ScanInputError) {
      process.stderr.write(`error: ${e.message}\n`);
      return e.exitCode;
    }
    if (e instanceof RuleValidationError) {
      process.stderr.write(`${e.message}\n`);
      return EXIT.ENGINE;
    }
    process.stderr.write(`internal error: ${(e as Error).stack ?? e}\n`);
    return EXIT.ENGINE;
  }
}
