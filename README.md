# Mobile Release Doctor

**Catch mobile release issues before App Review.**

A local-first, read-only scanner — packaged as a Claude Code skill — that
checks Flutter, React Native, Expo and native iOS/Android projects for
problems that commonly get apps rejected by the Apple App Store and Google
Play. Every finding comes with **evidence (file and line), why it matters,
how to fix it, and a link to the official source**.

> Mobile Release Doctor cannot guarantee approval. It reports what it can
> prove, flags what it suspects, and tells you plainly what a human must
> check. Exit code 0 means "the scan completed", never "the app will pass".

```text
Mobile Release Doctor v0.1.0 · offline · no AI
PROJECT  health_tracker · flutter · ios, android
RESULT   5 fail · 19 warn · 5 need verification · 0 info
STATUS   5 issue(s) with clear evidence must be fixed before release

FAIL   targetSdk 34 is below Google Play's requirement (API 36) [error] google.target-api-level
       Since 2026-08-31, new apps and app updates (phone-tablet) must target API level 36 or higher ...
       • android/app/build.gradle:14 — Target SDK — "34"
       Next: Raise targetSdk to 36 or higher, review the Android behavior changes ...
       Source: https://developer.android.com/google/play/requirements/target-sdk

FAIL   Release build is signed with the debug key [high] shared.debug-configuration
       • android/app/build.gradle:23 — Release signing config — "signingConfigs.debug"

VERIFY Contacts permission may be unnecessary [medium] shared.permission-usage-evidence
       The app declares contacts access, but the scanner found no known contacts dependency or
       API call in the scanned sources. This needs verification; it is not proof of a policy violation.
```

(Output from the bundled sample project `fixtures/flutter/risky-project`;
full report: [`fixtures/expected/flutter-risky.md`](fixtures/expected/flutter-risky.md).)

## Why

- **Evidence, not a checklist.** It reads `Info.plist`, `AndroidManifest.xml`,
  Gradle (Groovy and Kotlin DSL), `pubspec.yaml`/`pubspec.lock`,
  `package.json`, Expo `app.json`, Xcode project settings, privacy manifests
  and source code.
- **Honest about certainty.** Findings are `fail` (clear evidence), `warn`
  (signal to confirm), `needs_review` (cannot be verified automatically) or
  `info`. The engine refuses findings above a rule's allowed status or
  severity, so a heuristic can never claim a violation.
- **Versioned policy data.** Time-dependent requirements (like Google Play's
  target API level) come from a dated snapshot. When the snapshot is past its
  review date, conclusions downgrade to `needs_review` instead of silently
  using old numbers.
- **Private by design.** Runs offline, never uploads code, never executes
  your build or project scripts, redacts secret values in every report. No AI
  key needed — Claude (or you) reads the JSON report, not your whole repo.

## Install

### As a Claude Code plugin (recommended)

```bash
claude plugin marketplace add lehongphuong/mobile-release-doctor
claude plugin install mobile-release-doctor@mobile-release-doctor
```

Then, inside your app's repository:

```text
/mobile-release-doctor:mobile-release-doctor scan
/mobile-release-doctor:mobile-release-doctor scan --platform ios
/mobile-release-doctor:mobile-release-doctor rejection      (paste Apple/Google's message)
/mobile-release-doctor:mobile-release-doctor fix            (proposes patches; edits only after you approve)
/mobile-release-doctor:mobile-release-doctor report         (Markdown report for your team/client)
```

Natural language works too: *"Scan this project before I submit to both stores"*,
*"Explain google.account-deletion-web"*, *"Here is my rejection from Apple — what do I fix?"*.

Uninstall: `claude plugin uninstall mobile-release-doctor@mobile-release-doctor`
(and `claude plugin marketplace remove mobile-release-doctor`).

### As a standalone skill

```bash
git clone https://github.com/lehongphuong/mobile-release-doctor
cp -r mobile-release-doctor/skills/mobile-release-doctor ~/.claude/skills/        # personal
# or: cp -r mobile-release-doctor/skills/mobile-release-doctor .claude/skills/    # per project
```

Invoke with `/mobile-release-doctor`. Remove the folder to uninstall.

### Without Claude (CLI / CI)

The scanner is one dependency-free file. Node.js 20+ is the only requirement.

```bash
node path/to/skills/mobile-release-doctor/scripts/scan.mjs --project . 
node .../scan.mjs --project . --format markdown --output release-report.md
node .../scan.mjs --project . --format json --output report.json --strict --fail-on high
```

See [docs/ci.md](docs/ci.md) for a GitHub Actions example and
[configuration](skills/mobile-release-doctor/references/configuration.md)
for every option and exit code.

## What it checks (v0.1.0)

| Rule | Store | What |
|---|---|---|
| `apple.permission-purpose-string` | Apple | Empty/vague `NS…UsageDescription`; keys required by plugins but missing (ITMS-90683) |
| `apple.required-reason-api` | Apple | Required reason APIs in your code vs `PrivacyInfo.xcprivacy`; invalid reason codes; manifest not in the Xcode target (ITMS-91053) |
| `google.target-api-level` | Google | `targetSdk` vs the requirement effective on the scan date (per form factor) |
| `google.sensitive-permissions` | Google | Background location, SMS/Call Log, all-files access, `QUERY_ALL_PACKAGES`, photo/video, foreground services, exact alarms, accessibility; Data safety prompts |
| `google.account-deletion-web` | Google | Web link for account deletion requests |
| `shared.account-deletion-in-app` | Both | Account creation signals vs an in-app deletion flow (never "passes" on a keyword) |
| `shared.privacy-policy` | Both | Policy URL present and not a placeholder; policy text vs data-collecting SDKs |
| `shared.review-access` | Both | Demo account for reviewers when login is required |
| `shared.release-version` | Both | Version/build format (e.g. `1.2.0-beta` rejected by App Store Connect) and hard-coded overrides of `pubspec.yaml` |
| `shared.debug-configuration` | Both | Debug-signed release, debuggable release, global cleartext, ATS disabled |
| `shared.app-identifier` | Both | `com.example` / invalid application ID and bundle ID |
| `shared.embedded-secrets` | Both | Private keys, cloud/payment secrets, committed keystores and signing passwords (values redacted) |
| `shared.permission-usage-evidence` | Both | Permissions with no matching dependency or API usage |
| `shared.placeholder-content` | Both | Framework starter templates, lorem ipsum, "Coming soon", template launcher label |

Details, sources and known limitations of every rule:
[rule catalog](skills/mobile-release-doctor/references/rule-catalog.md).

**Framework support.** Detection works for Flutter, React Native, Expo
(managed and prebuild) and native iOS/Android, and most rules read the
native config shared by all of them. Flutter has the deepest coverage
(plugin → permission mapping, `pubspec` versioning, template detection) and
the most fixtures.

**Not covered yet:** store listing metadata and screenshots, In-App Purchase
rules, runtime behavior, dependency vulnerability databases, building the
app. See the [roadmap](docs/roadmap.md).

## Project facts the scanner cannot see

Add `.release-doctor.yml` to your project to answer what code cannot tell
(does the app have accounts? what is the deletion URL? is there a demo
account?), set the CI threshold, and accept risks with a written reason:

```yaml
app:
  has_account_creation: true
  account_deletion:
    in_app_path: "Settings > Account > Delete account"
    web_url: https://yourapp.com/delete-account
  privacy_policy_url: https://yourapp.com/privacy
  requires_login_for_review: true
  review_demo_account_provided: true
fail_on: high
ignore:
  - rule: shared.embedded-secrets
    path: lib/firebase_options.dart
    reason: Firebase client config is public by design
```

## Try it on the sample projects

```bash
git clone https://github.com/lehongphuong/mobile-release-doctor && cd mobile-release-doctor
node skills/mobile-release-doctor/scripts/scan.mjs --project fixtures/flutter/risky-project
node skills/mobile-release-doctor/scripts/scan.mjs --project fixtures/flutter/clean-project
```

`fixtures/` contains clean, risky and "not enough data" projects; the
expected reports are in `fixtures/expected/` and are checked in CI.

## Contributing

New rules and real rejection cases are the most valuable contributions.
Every rule needs official sources and positive, negative and unknown tests —
see [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/architecture.md](docs/architecture.md).
Found a false positive? [Open an issue](https://github.com/lehongphuong/mobile-release-doctor/issues/new?template=false-positive.yml)
with a minimal reproduction; no private source needed.

## License

[MIT](LICENSE)
