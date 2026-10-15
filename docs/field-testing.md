# Field testing log

Scans of public open-source apps, used to find false positives before a
release. Shallow clones of the default branch on the date shown; nothing is
uploaded and no project code is executed.

## 2026-10-14 — v0.1.0 pre-release

| App | Framework | Before fixes | After fixes |
|---|---|---|---|
| [lichess-org/mobile](https://github.com/lichess-org/mobile) | Flutter | 0 fail · 17 warn · 4 review · 1 info | 0 fail · 2 warn · 4 review · 1 info |
| [bluesky-social/social-app](https://github.com/bluesky-social/social-app) | Expo | 0 fail · 6 warn · 5 review + 6 parse errors | 0 fail · 2 warn · 4 review |

False positives found and fixed (each has a regression test):

- **Translation catalogs flagged as secrets.** Keys such as
  `newPasswordStrength` in `lib/l10n/*.arb`. The generic credential check
  now skips translation files, requires the name to *end* with a credential
  term and the value to look random.
- **Empty library manifests reported as invalid.** `<manifest></manifest>`
  in local Expo modules is valid.
- **Expo managed purpose strings.** With no `ios/` folder, config plugins add
  purpose strings at prebuild, so "missing key" is no longer reported; an
  extension's Info.plist (NSExtension) is no longer treated as the app's.
- **Storybook / exception text.** Lorem ipsum in Storybook screens and
  `"Not implemented"` error messages are ignored.

Findings that held up on manual inspection:

- lichess: Swift code in the widget extension uses `UserDefaults(suiteName:)`
  and the repository has no `PrivacyInfo.xcprivacy` → `apple.required-reason-api`
  warning. Whether App Store Connect flags it depends on what the build
  bundles; the warning asks for verification.
- Both: `flutter.targetSdkVersion` / Expo SDK defaults are computed, so the
  scanner asks to verify the target API instead of guessing.
