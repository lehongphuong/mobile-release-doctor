import type { Report } from "../findings/report.js";
import type { Finding } from "../findings/types.js";

interface Style {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  yellow(s: string): string;
  cyan(s: string): string;
  green(s: string): string;
}

function style(color: boolean): Style {
  const wrap = (open: number, close: number) => (s: string) => (color ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return { bold: wrap(1, 22), dim: wrap(2, 22), red: wrap(31, 39), yellow: wrap(33, 39), cyan: wrap(36, 39), green: wrap(32, 39) };
}

const LABEL: Record<Finding["status"], string> = { fail: "FAIL", warn: "WARN", needs_review: "VERIFY", info: "INFO" };

export function renderText(report: Report, opts: { color?: boolean } = {}): string {
  const c = style(opts.color ?? false);
  const s = report.summary;
  const tint = (f: Finding) => (f.status === "fail" ? c.red : f.status === "warn" ? c.yellow : f.status === "needs_review" ? c.cyan : c.dim);
  const out: string[] = [];
  out.push(c.bold("Mobile Release Doctor") + c.dim(` v${report.tool.version} · offline · no AI`));
  out.push(`${c.dim("PROJECT")}  ${report.project.name} · ${report.project.framework} · ${report.project.platforms.join(", ")}`);
  out.push(
    `${c.dim("RESULT")}   ${c.red(`${s.by_status.fail} fail`)} · ${c.yellow(`${s.by_status.warn} warn`)} · ${c.cyan(`${s.by_status.needs_review} need verification`)} · ${s.by_status.info} info`,
  );
  out.push(`${c.dim("STATUS")}   ${s.headline}`);
  out.push("");
  for (const f of report.findings) {
    out.push(`${tint(f)(c.bold(LABEL[f.status].padEnd(6)))} ${c.bold(f.title)} ${c.dim(`[${f.severity}] ${f.rule_id}`)}`);
    out.push(`       ${f.explanation}`);
    for (const e of f.evidence.slice(0, 4)) {
      const loc = e.file ? `${e.file}${e.line ? `:${e.line}` : ""}` : "";
      out.push(c.dim(`       • ${[loc, e.description, e.value !== undefined ? (/^["']/.test(e.value) ? e.value : `"${e.value}"`) : ""].filter(Boolean).join(" — ")}`));
    }
    if (f.evidence.length > 4) out.push(c.dim(`       • … ${f.evidence.length - 4} more`));
    out.push(`       ${c.green("Next:")} ${f.recommendation}`);
    out.push(c.dim(`       Source: ${f.references[0]?.url ?? ""}`));
    out.push("");
  }
  const skipped = report.rule_results.filter((r) => r.outcome === "skip");
  const passed = report.rule_results.filter((r) => r.outcome === "pass");
  out.push(c.dim(`${passed.length} rule(s) passed, ${skipped.length} skipped${s.suppressed ? `, ${s.suppressed} finding(s) suppressed` : ""}.`));
  for (const r of report.rule_results.filter((r) => r.outcome === "error")) out.push(c.red(`Rule error: ${r.rule_id}: ${r.reason}`));
  for (const d of report.diagnostics) out.push(c.dim(`${d.level}: ${d.file ? `${d.file}: ` : ""}${d.message}`));
  if (report.comparison) {
    out.push(`Compared with previous scan: ${report.comparison.resolved.length} resolved, ${report.comparison.new.length} new, ${report.comparison.unchanged} unchanged.`);
  }
  out.push("");
  out.push(c.dim(report.disclaimer));
  return out.join("\n") + "\n";
}
