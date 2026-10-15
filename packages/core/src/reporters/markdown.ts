import type { Report } from "../findings/report.js";
import type { Evidence, Finding } from "../findings/types.js";

const STATUS_LABEL: Record<Finding["status"], string> = {
  fail: "FAIL",
  warn: "WARN",
  needs_review: "NEEDS REVIEW",
  info: "INFO",
};

const READINESS_LABEL: Record<Report["summary"]["readiness"], string> = {
  "blocking-issues": "🔴 Blocking issues found",
  "issues-to-verify": "🟠 Risks to fix or verify",
  "manual-review-needed": "🟡 Manual review needed",
  "no-issues-detected": "🟢 No issues detected by automated checks",
};

/** Escape characters that would break Markdown table cells or inline text. */
function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function code(s: string): string {
  const clean = s.replace(/\r?\n/g, " ");
  return clean.includes("`") ? `\`\` ${clean} \`\`` : `\`${clean}\``;
}

function evidenceLine(e: Evidence): string {
  const loc = e.file ? code(`${e.file}${e.line ? `:${e.line}` : ""}`) : "";
  const kv = e.key ? ` ${code(e.key)}${e.value !== undefined ? ` = ${code(e.value)}` : ""}` : e.value !== undefined ? ` ${code(e.value)}` : "";
  return `- ${[loc, esc(e.description)].filter(Boolean).join(" — ")}${kv}`;
}

function findingBlock(f: Finding): string {
  const lines = [
    `#### ${STATUS_LABEL[f.status]} · ${f.severity.toUpperCase()} — ${esc(f.title)}`,
    "",
    `\`${f.rule_id}\` · platform: ${f.platform} · confidence: ${f.confidence} · verification: ${f.verification} · id: \`${f.fingerprint}\``,
    "",
    esc(f.explanation),
    "",
    "**Evidence**",
    "",
    ...(f.evidence.length ? f.evidence.map(evidenceLine) : ["- (none)"]),
    "",
    `**Next step:** ${esc(f.recommendation)}`,
    "",
    `**Sources:** ${f.references.map((r) => `[${esc(r.title)}](${r.url})`).join(" · ")}`,
    "",
  ];
  return lines.join("\n");
}

export function renderMarkdown(report: Report): string {
  const s = report.summary;
  const out: string[] = [];
  out.push(`# Mobile Release Doctor report — ${esc(report.project.name)}`);
  out.push("");
  out.push(`> ${report.disclaimer}`);
  out.push("");
  out.push(`**${READINESS_LABEL[s.readiness]}** — ${s.headline}.`);
  out.push("");
  out.push("| | |");
  out.push("|---|---|");
  out.push(`| Project | ${esc(report.project.name)} · ${report.project.framework} · ${report.project.platforms.join(", ") || "no platforms"} |`);
  out.push(`| Findings | ${s.by_status.fail} fail · ${s.by_status.warn} warn · ${s.by_status.needs_review} needs review · ${s.by_status.info} info |`);
  out.push(`| Rules | ${s.rules.pass} pass · ${s.rules.fail + s.rules.warn + s.rules.needs_review + s.rules.info} with findings · ${s.rules.skip} skipped · ${s.rules.error} errors |`);
  out.push(`| Fail threshold | \`${report.options.fail_on}\` → ${s.threshold_exceeded ? "**exceeded**" : "not exceeded"} |`);
  out.push(`| Policy snapshot | ${report.catalog.policy_snapshot.version} (verified ${report.catalog.policy_snapshot.verified_on}${report.catalog.policy_snapshot.stale ? ", **stale**" : ""}) |`);
  out.push(`| Evaluated on | ${report.evaluation_date} · tool ${report.tool.version} · offline, no AI |`);
  out.push("");

  if (report.comparison) {
    const c = report.comparison;
    out.push("## Compared with previous scan");
    out.push("");
    out.push(`${c.resolved.length} resolved · ${c.new.length} new · ${c.unchanged} unchanged`);
    out.push("");
    for (const r of c.resolved) out.push(`- ✅ resolved: ${esc(r.title)} (\`${r.rule_id}\`)`);
    for (const n of c.new) out.push(`- 🆕 new: ${esc(n.title)} (\`${n.rule_id}\`)`);
    out.push("");
  }

  const groups: [string, string, Finding[]][] = [
    ["Must fix before release", "Clear evidence of a violation or technical defect.", report.findings.filter((f) => f.status === "fail")],
    ["Risks to fix or verify", "Signals that something is wrong; confirm and fix.", report.findings.filter((f) => f.status === "warn")],
    ["Needs manual review", "Cannot be verified automatically; a human must decide.", report.findings.filter((f) => f.status === "needs_review")],
    ["Information", "Reminders and good practice.", report.findings.filter((f) => f.status === "info")],
  ];
  out.push("## Findings");
  out.push("");
  if (!report.findings.length) out.push("No findings.\n");
  for (const [title, desc, items] of groups) {
    if (!items.length) continue;
    out.push(`### ${title} (${items.length})`);
    out.push("");
    out.push(`_${desc}_`);
    out.push("");
    for (const f of items) out.push(findingBlock(f));
  }
  if (s.hidden_below_severity) out.push(`_${s.hidden_below_severity} finding(s) below \`${report.options.min_severity}\` hidden._\n`);

  out.push("## Rule results");
  out.push("");
  out.push("| Rule | Outcome | Details |");
  out.push("|---|---|---|");
  for (const r of report.rule_results) {
    out.push(`| \`${r.rule_id}\` ${esc(r.title)} | ${r.outcome}${r.finding_count ? ` (${r.finding_count})` : ""} | ${esc(r.reason ?? "")} |`);
  }
  out.push("");
  if (report.suppressed.length) {
    out.push("## Suppressed by configuration");
    out.push("");
    for (const x of report.suppressed) out.push(`- \`${x.rule_id}\` ${esc(x.title)} — ${esc(x.reason)}`);
    out.push("");
  }
  if (report.diagnostics.length) {
    out.push("## Scanner diagnostics");
    out.push("");
    for (const d of report.diagnostics) out.push(`- **${d.level}** ${d.file ? `${code(d.file)}: ` : ""}${esc(d.message)}`);
    out.push("");
  }
  return out.join("\n");
}
