# Architecture

```
Claude Code ──(SKILL.md: workflow + safety rules)──┐
                                                    ▼
             skills/mobile-release-doctor/scripts/scan.mjs   (bundled, dependency-free)
                                                    │
   ┌────────────────────────────────────────────────┴──────────────────────────┐
   │ packages/core/src                                                           │
   │  analyzer/   detect.ts (framework, monorepo) · project.ts (lazy parsed view) │
   │  parsers/    plist · AndroidManifest · Gradle (extract, never evaluate)      │
   │  rules/      one RuleCheck per rule + shared signals (capabilities, accounts)│
   │  rules-engine/ schema (zod) · loader (YAML + policy) · engine (contract)     │
   │  findings/   types · redaction · report model (readiness, comparison)        │
   │  reporters/  text · markdown · json                                          │
   └─────────────────────────────────────────────────────────────────────────────┘
          ▲                                   ▲
   rules/**/*.yaml (metadata)         policy/sources.yaml · policy/policy-data.yaml
```

**Skill = orchestration, scanner = truth.** Claude never decides compliance
on its own: it runs the deterministic scanner, reads the JSON report, and
explains, prioritizes and (with approval) fixes. This keeps results
reproducible, testable and cheap in tokens.

## Flow

1. `detectFramework` finds Flutter / React Native / Expo / native iOS /
   native Android from marker files. Unsupported roots list sub-projects.
2. `ProjectContext` walks files (no symlinks, default excludes, config
   `exclude_paths`) and parses lazily. Parse failures become diagnostics.
3. `loadCatalog` validates every rule YAML, policy source and the policy
   snapshot with zod; any problem aborts with a full list (exit 3).
4. `runRules` selects rules by platform/framework, runs each in isolation,
   and enforces the **contract**: status ∈ `allowed_statuses`, severity ≤
   `max_severity`, schema-valid finding, cited references belong to the
   rule. Violations turn the rule's outcome into `error`, never a finding.
5. Findings are redacted, fingerprinted (stable ids for `--baseline`),
   filtered by config `ignore` (with reasons) and sorted.
6. The report adds readiness (no score), counts, threshold result, rule
   results (pass/skip with reason), diagnostics and the disclaimer.

## Status model

| Status | Meaning | Who may emit |
|---|---|---|
| `fail` | Clear evidence of a violation/defect | rules with `config-parse`/`deterministic` verification and a verified requirement |
| `warn` | Signal; confirm and fix | any rule that allows it |
| `needs_review` | Cannot be decided automatically | any rule |
| `info` | Reminder | rules that allow it |

## Why a committed bundle?

Plugins and skills are installed by copying files; there is no
`npm install` step. `scripts/build.mjs` bundles the TypeScript core with its
three dependencies (yaml, fast-xml-parser, zod) into one ESM file. CI
verifies the bundle matches the sources.

## Time-dependent policy

`policy-data.yaml` stores requirements with `effective_from`, a source id,
`verified_on` and `review_by`. Rules pick the requirement effective on the
evaluation date (`--date` for reproducible runs). Past `review_by`, a value
that *meets* the last known requirement becomes `needs_review`; a value
below it still fails, because store requirements only rise.
