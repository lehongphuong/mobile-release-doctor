# Supported checks

The authoritative list, generated from the rule metadata, is
[skills/mobile-release-doctor/references/rule-catalog.md](../skills/mobile-release-doctor/references/rule-catalog.md).

Run `node skills/mobile-release-doctor/scripts/scan.mjs --list-rules` to see
the rules in your installed version.

## Coverage by framework

| Framework | Detection | Config read | Notes |
|---|---|---|---|
| Flutter | ✅ | pubspec.yaml/.lock, ios/Runner, android/app, Dart sources | Deepest coverage |
| React Native | ✅ | package.json, ios/, android/ (rootProject.ext resolved) | Native folders required |
| Expo | ✅ | app.json (`expo.ios.infoPlist`, `android.permissions`, identifiers, versions, expo-build-properties); ios/android if prebuilt | `app.config.js/ts` is not executed |
| Native iOS | ✅ | Info.plist, project.pbxproj, PrivacyInfo.xcprivacy, Swift/ObjC | Android rules skipped |
| Native Android | ✅ | Gradle (Groovy/KTS), AndroidManifest, Kotlin/Java | iOS rules skipped |

## Known limitations

- Manifests merged from libraries at build time are not visible.
- Values computed in Gradle, xcconfig, flavors or CI are reported as
  computed (`needs_review`) rather than guessed.
- Store consoles (App Store Connect, Play Console) are not accessed; facts
  from them come from `.release-doctor.yml`.
- Heuristic rules can miss or over-report; their status is `warn` or
  `needs_review` for that reason.
