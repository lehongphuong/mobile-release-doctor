import type { Report } from "../findings/report.js";

export function renderJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
