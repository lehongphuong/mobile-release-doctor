# Contributing

Thanks for helping developers ship with fewer rejections. The most useful
contributions are **real rejection cases**, **false-positive reports with a
minimal reproduction**, and **new rules backed by official sources**.

## Setup

```bash
npm ci
npm test            # vitest: rules, engine, parsers, CLI, report snapshots
npm run typecheck
npm run build       # regenerates the bundled scanner and the rule catalog
```

`skills/mobile-release-doctor/scripts/scan.mjs` and
`skills/mobile-release-doctor/references/rule-catalog.md` are generated and
committed (users install the skill without `npm install`). CI fails if they
are out of date, so run `npm run build` before committing.

## Adding a rule

A rule is three files, and nothing in the engine needs to change:

1. **Metadata** — `skills/mobile-release-doctor/rules/<ios|android|shared>/<name>.yaml`
   (`apple.*` → `ios/`, `google.*` → `android/`, `shared.*` → `shared/`).
   Copy an existing file. Required: stable `id`, `version`, platforms,
   frameworks, `severity`, `max_severity`, `allowed_statuses`,
   `requirement_status`, `verification`, `policy_references`,
   `recommendation`, `limitations`, `introduced_in`.
2. **Check** — `packages/core/src/rules/<id-with-dashes>.ts` exporting a
   `RuleCheck`, registered in `packages/core/src/rules/index.ts`. Return
   `{ skip: reason }` when the rule does not apply, or `{ findings, checked }`.
3. **Tests** — `packages/core/tests/rules/<id>.test.ts` with
   `describe("positive")`, `describe("negative")` and `describe("unknown")`.
   Build projects from fixtures with `scanFixture(fixture, overlay)`.

### Rules for rules

- **Cite official sources only** (Apple Developer, App Store Review
  Guidelines, Google Play Console Help, Android Developers). Add the URL to
  `policy/sources.yaml` with the date you re-read it (`last_checked`).
- **Don't hard-code deadlines or API levels** in checks. Put time-dependent
  values in `policy/policy-data.yaml` with `effective_from` and a source.
- **Match status to evidence.** `fail` only for unambiguous evidence;
  heuristics use `warn` or `needs_review`. The schema rejects
  `source-heuristic` or `needs-research` rules that allow `fail`.
- **Absence of evidence is not proof.** If you cannot find a feature, say
  so; don't conclude it does not exist. Never `pass` on a keyword match.
- **Evidence must point somewhere**: file, line, key, value whenever possible.
  Never put secret values in evidence (use `maskSecret`).
- **Read-only and offline.** Checks must not write files, use the network,
  or execute project code.
- **Fixtures are synthetic.** Never add private source code, real
  credentials or user data. Build secret-shaped strings at test runtime
  (see `fake` in `tests/helpers.ts`) so the repository never contains them.

When a rule's behavior changes, bump its `version` and update snapshots with
`npx vitest run -u`; review the diff in `fixtures/expected/`.

## Updating policy data

1. Re-read the official page.
2. Update `policy/policy-data.yaml` (`verified_on`, `review_by`, entries).
3. Update `last_checked` in `policy/sources.yaml` for pages you re-read.
4. `node skills/mobile-release-doctor/scripts/validate-policy-sources.mjs`
   checks reachability (it does not prove the text is unchanged).

## Commit and PR

Small PRs, one rule or fix at a time. Fill in the PR checklist.
