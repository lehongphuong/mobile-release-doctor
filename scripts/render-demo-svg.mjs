// Renders docs/assets/demo.svg — a terminal-style picture of a real scan of
// fixtures/flutter/risky-project, so the README demo never drifts from the
// scanner's actual output. Run: node scripts/render-demo-svg.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const report = JSON.parse(
  execFileSync(process.execPath, [
    "skills/mobile-release-doctor/scripts/scan.mjs",
    "--project", "fixtures/flutter/risky-project",
    "--format", "json", "--no-git", "--date", "2026-10-14",
  ], { encoding: "utf8" }),
);

const C = { bg: "#0d1117", bar: "#161b22", text: "#e6edf3", dim: "#8b949e", red: "#ff7b72", yellow: "#e3b341", cyan: "#79c0ff", green: "#7ee787", purple: "#d2a8ff" };
const LABEL = { fail: ["FAIL", C.red], warn: ["WARN", C.yellow], needs_review: ["VERIFY", C.cyan], info: ["INFO", C.dim] };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Each line is a list of [text, color, bold?] spans.
const lines = [];
const s = report.summary.by_status;
lines.push([["$ ", C.green, true], ["/mobile-release-doctor scan", C.text, true]]);
lines.push([]);
lines.push([["Mobile Release Doctor", C.text, true], [` v${report.tool.version} · offline · no AI`, C.dim]]);
lines.push([["PROJECT  ", C.dim], [`${report.project.name} · ${report.project.framework} · ${report.project.platforms.join(", ")}`, C.text]]);
lines.push([["RESULT   ", C.dim], [`${s.fail} fail`, C.red, true], [" · ", C.dim], [`${s.warn} warn`, C.yellow, true], [" · ", C.dim], [`${s.needs_review} need verification`, C.cyan, true]]);
lines.push([]);

const pick = [
  "google.target-api-level",
  "shared.debug-configuration",
  "apple.permission-purpose-string",
  "apple.required-reason-api",
  "shared.account-deletion-in-app",
  "shared.permission-usage-evidence",
];
for (const id of pick) {
  const f = report.findings.find((x) => x.rule_id === id);
  if (!f) continue;
  const [label, color] = LABEL[f.status];
  lines.push([[label.padEnd(7), color, true], [cut(f.title, 74), C.text, true], [`  ${f.rule_id}`, C.dim]]);
  const e = f.evidence.find((x) => x.file) ?? f.evidence[0];
  if (e) lines.push([["       ↳ ", C.dim], [cut(`${e.file ?? ""}${e.line ? `:${e.line}` : ""}`, 48), C.purple], [`  ${cut(e.description, 50)}`, C.dim]]);
  lines.push([["       Fix: ", C.green], [cut(f.recommendation.split(/(?<=\.)\s/)[0], 92), C.text]]);
  lines.push([]);
}
lines.push([["… ", C.dim], [`${report.findings.length - pick.length} more findings, each with evidence, a fix and an official source`, C.dim]]);

const W = 1000, LH = 22, PAD = 24, TOP = 52;
const H = TOP + PAD + lines.length * LH;
const body = lines
  .map((spans, i) => {
    if (!spans.length) return "";
    const y = TOP + PAD + i * LH;
    const t = spans.map(([text, fill, bold]) => `<tspan fill="${fill}"${bold ? ' font-weight="700"' : ""}>${esc(text)}</tspan>`).join("");
    return `<text x="${PAD}" y="${y}" xml:space="preserve">${t}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mobile Release Doctor scanning a sample Flutter project">
  <title>Mobile Release Doctor — sample scan of fixtures/flutter/risky-project</title>
  <rect width="${W}" height="${H}" rx="12" fill="${C.bg}"/>
  <path d="M0 12a12 12 0 0 1 12-12h${W - 24}a12 12 0 0 1 12 12v24H0z" fill="${C.bar}"/>
  <circle cx="22" cy="18" r="6" fill="#ff5f57"/><circle cx="42" cy="18" r="6" fill="#febc2e"/><circle cx="62" cy="18" r="6" fill="#28c840"/>
  <text x="${W / 2}" y="23" text-anchor="middle" fill="${C.dim}" font-family="ui-sans-serif, -apple-system, Segoe UI, sans-serif" font-size="13">health_tracker — claude</text>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14">
  ${body}
  </g>
</svg>
`;
writeFileSync("docs/assets/demo.svg", svg);
console.log(`Wrote docs/assets/demo.svg (${lines.length} lines)`);
