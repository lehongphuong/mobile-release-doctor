import type { ProjectContext } from "../analyzer/project.js";
import type { DraftFinding } from "../findings/types.js";
import type { PolicyData, RuleMetadata } from "./schema.js";

export interface RuleContext {
  project: ProjectContext;
  policy: PolicyData;
  rule: RuleMetadata;
}

export type RuleCheckResult =
  | { skip: string }
  | {
      findings: DraftFinding[];
      /** What was checked, shown when the rule passes. */
      checked?: string;
    };

export interface RuleCheck {
  id: string;
  run(ctx: RuleContext): RuleCheckResult;
}
