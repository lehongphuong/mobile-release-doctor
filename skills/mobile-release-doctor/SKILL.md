---
name: mobile-release-doctor
argument-hint: "[scan|rejection|fix|report] [--platform ios|android|all]"
description: Audit Flutter, React Native, Expo and native iOS/Android projects for App Store and Google Play release risks before submission, explain findings with evidence and official sources, guide fixes, and analyze store rejection messages. Use when preparing a mobile release, checking store compliance (permissions, privacy manifest, target SDK, account deletion, signing, secrets), or investigating an App Review / Google Play rejection.
---

# Mobile Release Doctor

You orchestrate a **deterministic, local, read-only scanner**. The scanner finds
evidence; you explain it, prioritize it and help fix it. Never replace the
scanner's results with your own guesses.

The scanner is `${CLAUDE_SKILL_DIR}/scripts/scan.mjs` (no dependencies;
Node.js 20+ only). Always call it by that absolute path; the working
directory is the user's project, not the skill folder.

## Arguments

Arguments given with the slash command: `$ARGUMENTS`

- `scan` (or empty) → workflow 1. `rejection` → workflow 4. `fix` →
  workflow 3. `report` → workflow 5.
- Pass `--platform ios|android|all`, `--rules <ids>` and `--severity <s>`
  through to the scanner unchanged. Ignore anything else and say so.
- Without arguments, infer the workflow from the user's message.

## Workflows

Pick the workflow from the request. Ask only if it is genuinely unclear.

### 1. Scan before release (default)

1. Run the scanner from the project root (add `--platform ios|android` if the
   user asked for one store only):

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/scan.mjs" --project . --format json --output .release-doctor/report.json
   ```

   - Exit 0: scan completed. Exit 1: only with `--strict`. Exit 2: bad
     arguments/config or no supported project (the error lists sub-projects
     in a monorepo; re-run with `--project <path>`). Exit 3: scanner/rule
     error — report it, do not hide it. Exit 4: requested platform missing.
2. Read `.release-doctor/report.json`. Do **not** read the whole source tree
   to "double-check"; open only the files named in evidence when you need
   context to explain or fix a finding.
3. Report to the user, in their language, grouped as the scanner groups them:
   - **Must fix** (`status: fail`) — clear evidence.
   - **Risks to fix or verify** (`warn`).
   - **Needs manual review** (`needs_review`) — say exactly what the human
     must check and why the scanner cannot.
   - Mention skipped rules that matter (e.g. no iOS target) and diagnostics.
   For each finding give: title, file:line evidence, why it matters, next
   step, and the cited source URL from `references`. Keep the scanner's
   status and severity — never upgrade a `warn`/`needs_review` to a
   certain violation, and never call `needs_review` a pass.
4. Offer fixes for confirmed issues (workflow 3). Suggest creating
   `.release-doctor.yml` when many items are `needs_review` because facts are
   unknown (see `references/configuration.md`).

### 2. Explain one rule or finding

Read `references/rule-catalog.md` for the rule, and the evidence in the
report. Use `node "${CLAUDE_SKILL_DIR}/scripts/scan.mjs" --list-rules` for the current IDs.

### 3. Fix with approval, then rescan

1. Propose a patch for the selected findings and show the diff. **Do not
   edit files until the user approves.** Never touch signing keys, keystores
   or credentials; tell the user how to rotate them instead.
2. After approved edits, rescan and compare with the previous report:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/scan.mjs" --project . --format json \
     --baseline .release-doctor/report.json --output .release-doctor/report-after.json
   ```

3. Report `comparison.resolved`, `comparison.new`, and what is still open.

### 4. Store rejection analysis

When the user pastes an Apple or Google rejection message:

1. Read `references/rejection-playbook.md`.
2. Identify the platform, guideline/policy and the reviewer's concrete
   complaint. Quote the relevant sentence.
3. Run (or reuse) a scan and map findings that relate to the rejection.
   Say clearly when the rejection concerns something the scanner cannot see
   (screenshots, metadata, runtime behavior, review notes).
4. Give a prioritized fix plan, a verification checklist before resubmitting,
   and — if useful — a short, factual reply to App Review in English. Never
   claim fixes that were not made.

### 5. Release report for a team or client

```bash
node "${CLAUDE_SKILL_DIR}/scripts/scan.mjs" --project . --format markdown --output .release-doctor/report.md
```

## CI usage

`node "${CLAUDE_SKILL_DIR}/scripts/scan.mjs" --project . --strict --fail-on high` exits 1
when a `fail`/`warn` finding at or above the threshold exists. See
`references/configuration.md` for ignores with reasons.

## Safety rules (always)

- The scanner is read-only and offline. Do not run the project's build,
  tests, `npm install`, `pod install`, Gradle or Flutter commands unless the
  user explicitly asks; they execute third-party code.
- Never upload source code, reports or secrets to external services. Evidence
  values for secrets are redacted; keep them redacted when you quote them.
- Never claim that passing checks guarantees App Store or Google Play
  approval. Say "no issue detected by automated checks".
- Do not invent policy requirements, deadlines or API levels. Cite the
  `references` URL attached to each finding. Time-dependent values come from
  the policy snapshot in the report (`catalog.policy_snapshot`); if it is
  `stale`, say so.
- Absence of evidence is not proof. If the scanner could not find a feature,
  do not state the feature does not exist.

## Reference files (load only when needed)

- `references/rule-catalog.md` — every rule: what it checks, statuses, limits.
- `references/apple-review.md` — Apple topics the rules cover and how to fix them.
- `references/google-play-policy.md` — Google Play topics and fixes.
- `references/rejection-playbook.md` — mapping common rejection messages to rules and fixes.
- `references/configuration.md` — `.release-doctor.yml`, CLI options, exit codes.
