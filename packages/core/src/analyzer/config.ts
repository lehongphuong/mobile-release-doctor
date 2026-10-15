import { z } from "zod";
import { SEVERITIES } from "../findings/types.js";

const triState = z.union([z.boolean(), z.literal("unknown")]);

/**
 * `.release-doctor.yml` in the project root: facts the developer confirms
 * that cannot be read from source (store listing, policies, account flows).
 */
export const projectConfigSchema = z
  .object({
    app: z
      .object({
        has_account_creation: triState.default("unknown"),
        account_deletion: z
          .object({
            in_app_path: z.string().min(1).optional(),
            web_url: z.string().url().optional(),
          })
          .strict()
          .default({}),
        privacy_policy_url: z.string().url().optional(),
        requires_login_for_review: triState.default("unknown"),
        review_demo_account_provided: z.boolean().optional(),
      })
      .strict()
      .default({}),
    ignore: z
      .array(
        z
          .object({
            rule: z.string().min(1),
            path: z.string().min(1).optional(),
            reason: z.string().min(3),
          })
          .strict(),
      )
      .default([]),
    fail_on: z.enum(SEVERITIES).default("high"),
    exclude_paths: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export const CONFIG_FILENAMES = [".release-doctor.yml", ".release-doctor.yaml"];
