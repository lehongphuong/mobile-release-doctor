import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { toPosix } from "../analyzer/walk.js";
import type { PolicyReference } from "../findings/types.js";
import { resolveSkillDir } from "./assets.js";
import {
  policyDataFileSchema,
  policySourcesFileSchema,
  ruleMetadataSchema,
  type PolicyData,
  type PolicySource,
  type RuleMetadata,
} from "./schema.js";

export class RuleValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Rule catalog is invalid:\n- ${problems.join("\n- ")}`);
  }
}

export interface LoadedRule {
  meta: RuleMetadata;
  file: string;
  references: PolicyReference[];
}

export interface Catalog {
  skillDir: string;
  rules: LoadedRule[];
  sources: Map<string, PolicySource>;
  sourcesVersion: string;
  policy: PolicyData;
}

function listYaml(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listYaml(p));
    else if (/\.ya?ml$/.test(entry.name)) out.push(p);
  }
  return out.sort();
}

function formatIssues(file: string, issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((i) => `${file}: ${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
}

/** Load and validate rules and policy data. Throws RuleValidationError listing every problem. */
export function loadCatalog(skillDir = resolveSkillDir()): Catalog {
  const problems: string[] = [];

  const sourcesPath = join(skillDir, "policy", "sources.yaml");
  const sourcesParsed = policySourcesFileSchema.safeParse(parseYaml(readFileSync(sourcesPath, "utf8")));
  const sources = new Map<string, PolicySource>();
  let sourcesVersion = "unknown";
  if (!sourcesParsed.success) problems.push(...formatIssues("policy/sources.yaml", sourcesParsed.error.issues));
  else {
    sourcesVersion = sourcesParsed.data.snapshot_version;
    for (const s of sourcesParsed.data.sources) {
      if (sources.has(s.id)) problems.push(`policy/sources.yaml: duplicate source id ${s.id}`);
      sources.set(s.id, s);
    }
  }

  const policyPath = join(skillDir, "policy", "policy-data.yaml");
  const policyParsed = policyDataFileSchema.safeParse(parseYaml(readFileSync(policyPath, "utf8")));
  if (!policyParsed.success) problems.push(...formatIssues("policy/policy-data.yaml", policyParsed.error.issues));
  else {
    for (const r of policyParsed.data.google_target_api) {
      if (!sources.has(r.source)) problems.push(`policy/policy-data.yaml: unknown source ${r.source}`);
    }
  }

  const rules: LoadedRule[] = [];
  const ids = new Set<string>();
  for (const abs of listYaml(join(skillDir, "rules"))) {
    const file = toPosix(relative(skillDir, abs));
    let data: unknown;
    try {
      data = parseYaml(readFileSync(abs, "utf8"));
    } catch (e) {
      problems.push(`${file}: invalid YAML: ${(e as Error).message}`);
      continue;
    }
    const parsed = ruleMetadataSchema.safeParse(data);
    if (!parsed.success) {
      problems.push(...formatIssues(file, parsed.error.issues));
      continue;
    }
    const meta = parsed.data;
    const expectedName = `${meta.id.slice(meta.id.indexOf(".") + 1)}.yaml`;
    if (!file.endsWith(`/${expectedName}`)) problems.push(`${file}: file name should be ${expectedName} to match id ${meta.id}`);
    const folder = meta.id.startsWith("apple.") ? "ios" : meta.id.startsWith("google.") ? "android" : "shared";
    if (!file.startsWith(`rules/${folder}/`)) problems.push(`${file}: rule ${meta.id} belongs in rules/${folder}/`);
    if (ids.has(meta.id)) problems.push(`${file}: duplicate rule id ${meta.id}`);
    ids.add(meta.id);
    const references: PolicyReference[] = [];
    for (const refId of meta.policy_references) {
      const src = sources.get(refId);
      if (!src) problems.push(`${file}: unknown policy reference ${refId}`);
      else references.push({ id: src.id, title: src.title, url: src.url });
    }
    rules.push({ meta, file, references });
  }

  if (problems.length || !policyParsed.success) throw new RuleValidationError(problems);
  return { skillDir, rules, sources, sourcesVersion, policy: policyParsed.data };
}
