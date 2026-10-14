export { scan, ScanInputError, type ScanOptions } from "./scan.js";
export { renderJson } from "./reporters/json.js";
export { renderMarkdown } from "./reporters/markdown.js";
export { renderText } from "./reporters/text.js";
export { loadCatalog } from "./rules-engine/loader.js";
export type { Report } from "./findings/report.js";
export type { Finding, Evidence, Severity, FindingStatus } from "./findings/types.js";
