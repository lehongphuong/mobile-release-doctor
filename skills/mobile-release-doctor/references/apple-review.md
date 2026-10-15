# Apple App Store topics covered

Load this when explaining an Apple-related finding or rejection. Cite the
URL attached to the finding; this file only summarizes.

## Purpose strings (`apple.permission-purpose-string`, `shared.permission-usage-evidence`)

- Every protected resource (camera, microphone, location, photos, contacts,
  Bluetooth, calendars, Face ID, speech, tracking, health, NFC) needs an
  `NS…UsageDescription` key in Info.plist. A missing key makes iOS terminate
  the app on access and may block upload (ITMS-90683).
- App Review (Guideline 5.1.1) expects the text to explain clearly and
  completely **why** the app needs the data. "Allow camera access" or
  "This app needs your location" are common rejection causes.
- Good fix pattern: `"Scan a receipt to add it to your expenses."` —
  feature + benefit, in the UI language, localized via `InfoPlist.strings`.
- Flutter/RN: keys go in `ios/Runner/Info.plist` (Flutter) or
  `ios/<App>/Info.plist`; Expo: `expo.ios.infoPlist` or the config plugin's
  permission option.
- Remove keys for features that do not exist; unused permissions draw
  questions from reviewers.

## Privacy manifest and required reason APIs (`apple.required-reason-api`)

- Apps and third-party SDKs declare required reason API usage in
  `PrivacyInfo.xcprivacy`. Categories: UserDefaults, FileTimestamp,
  SystemBootTime, DiskSpace, ActiveKeyboards — each with approved reason
  codes only (the rule lists them).
- Missing declarations produce ITMS-91053 emails / rejections.
- The **app** declares its own code; each **SDK** ships its own manifest.
  Fixing an SDK's missing manifest usually means updating the SDK.
- The file must be a member of the app target (Copy Bundle Resources).
- Xcode: File > New > File > App Privacy.

## Account deletion (`shared.account-deletion-in-app`)

- Guideline 5.1.1(v): apps that support account creation must let users
  initiate account deletion within the app. Deactivation alone is not
  enough; directing users to email/call is only acceptable in highly
  regulated industries. Sign in with Apple users: revoke tokens via the
  REST API.

## Version numbers (`shared.release-version`)

- `CFBundleShortVersionString`: up to three period-separated integers.
  Pre-release suffixes (`1.2.0-beta`) are rejected on upload.
- Each upload needs a higher `CFBundleVersion` (build number).

## App Transport Security (`shared.debug-configuration`)

- `NSAllowsArbitraryLoads = true` disables HTTPS enforcement. Prefer
  per-domain `NSExceptionDomains`. Reviewers may ask for justification.

## App completeness (`shared.placeholder-content`)

- Guideline 2.1: submit final versions with all metadata and working
  features; placeholder text, empty screens and template apps get rejected.
- Guideline 4.2: apps must offer more than a repackaged website or a
  template.

## Not covered automatically (tell the user to check manually)

- App Store Connect metadata, screenshots, age rating, App Privacy
  (nutrition label) answers, review notes and demo account.
- In-App Purchase rules (3.1.1) for digital goods.
- Sign in with Apple requirement when other third-party logins exist (4.8).
- Runtime crashes and broken links found during review (2.1).
