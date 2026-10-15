# Configuration, CLI options and exit codes

## `.release-doctor.yml` (project root, optional)

Facts the scanner cannot read from source code. Everything is optional;
unknown keys are rejected so typos are caught.

```yaml
app:
  # true | false | unknown (default). false skips account-deletion rules.
  has_account_creation: true
  account_deletion:
    in_app_path: "Settings > Account > Delete account"
    web_url: https://example-app.com/account/delete   # Google Play Data safety link
  privacy_policy_url: https://example-app.com/privacy
  requires_login_for_review: true                      # true | false | unknown
  review_demo_account_provided: true

# Findings with fail/warn status at or above this severity make --strict exit 1.
fail_on: high          # error | high | medium | low | info

# Paths (globs) excluded from scanning, relative to the project root.
exclude_paths:
  - lib/generated
  - "**/*.g.dart"

# Accepted risks. A reason is required and is shown in every report.
ignore:
  - rule: shared.embedded-secrets
    path: lib/firebase_options.dart
    reason: Firebase client configuration is public by design
```

When helping a user fill this file, ask them; never invent values.

## CLI

```text
node scan.mjs [--project <path>] [options]

--platform ios|android|all     --framework auto|flutter|react-native|expo|native-ios|native-android
--format text|markdown|json    --output <file>   --json-output <file>
--rules <id,id>                --severity <min severity shown>
--strict  --fail-on <severity> --baseline <previous report.json>
--config <file>                --policy-snapshot <policy-data.yaml>
--date YYYY-MM-DD              --no-git  --no-color
--offline  --no-ai             (accepted; the scanner is always offline and never calls AI)
--list-rules  --validate-rules --version  --help
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Scan completed; strict threshold not exceeded (or `--strict` not set). **Not** an approval guarantee. |
| 1 | `--strict` and a `fail`/`warn` finding at or above `fail_on`. |
| 2 | Invalid arguments, invalid config, or no supported project at the path (monorepo sub-projects are listed). |
| 3 | Scanner or rule error (a rule crashed or broke its contract). Report it as a bug. |
| 4 | Not enough data for the requested check (e.g. `--platform ios` on an Android-only project). |

## Report JSON (schema 1.0)

Top-level keys: `schema_version`, `tool`, `scanned_at`, `evaluation_date`,
`project`, `options`, `catalog` (incl. `policy_snapshot.stale`), `summary`
(`readiness`, `headline`, counts, `threshold_exceeded`), `findings`,
`rule_results` (one per rule: `pass | fail | warn | needs_review | info | skip | error`
with a reason), `suppressed`, `diagnostics`, optional `comparison`
(`resolved`, `new`, `unchanged`), `disclaimer`.

Each finding: `rule_id`, `rule_version`, `platform`, `framework`, `status`,
`severity`, `confidence`, `title`, `explanation`, `evidence[]`
(`file`, `line`, `key`, `value`, `description`), `recommendation`,
`references[]` (`id`, `title`, `url`), `verification`, `fingerprint`
(stable across scans; used for baselines).
