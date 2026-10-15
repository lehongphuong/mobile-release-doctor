# Google Play topics covered

Load this when explaining a Google Play finding or rejection. Cite the URL
attached to the finding; this file only summarizes.

## Target API level (`google.target-api-level`)

- Requirements change every year. The scanner reads them from the policy
  snapshot (`policy/policy-data.yaml`) with the date they were verified.
  As verified on 2026-10-14: from 2026-08-31, new apps and updates must
  target API 36 (Wear OS / Automotive: 35, Android TV / XR: 34).
- `flutter.targetSdkVersion` depends on the Flutter SDK version, so the
  scanner asks for verification rather than guessing.
- Raising targetSdk changes runtime behavior; test the release build.

## Account deletion (`shared.account-deletion-in-app`, `google.account-deletion-web`)

- Apps that allow account creation must offer deletion **in the app** and
  via a **web link** entered in the Data safety form, usable without the
  app installed. The page should say what is deleted and what is retained.

## Privacy policy and Data safety (`shared.privacy-policy`, `google.sensitive-permissions`)

- A privacy policy link is required in Play Console and, when the app
  handles personal or sensitive data, inside the app.
- The Data safety form must match what the app and its SDKs actually
  collect and share. Permissions are a starting point, not the full answer.

## Restricted permissions (`google.sensitive-permissions`)

| Permission | Policy |
|---|---|
| `ACCESS_BACKGROUND_LOCATION` | Core feature + prominent disclosure + declaration with video |
| SMS / Call Log group | Default handler or approved exception only |
| `MANAGE_EXTERNAL_STORAGE` | File managers, backup, etc. with declaration |
| `QUERY_ALL_PACKAGES` | Qualifying use; otherwise `<queries>` |
| `REQUEST_INSTALL_PACKAGES` | Limited core uses |
| `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` | Broad access only for core use; else the photo picker |
| `FOREGROUND_SERVICE_*` | Declare each type in Play Console |
| `USE_FULL_SCREEN_INTENT` | Calling / alarm apps |
| `USE_EXACT_ALARM` | Alarm, timer, calendar apps |
| `BIND_ACCESSIBILITY_SERVICE` | Declaration + disclosure |

Libraries often add these permissions during manifest merge. Strip unneeded
ones with `<uses-permission android:name="…" tools:node="remove"/>` and
inspect the merged manifest of a release build.

## Signing and identifiers (`shared.debug-configuration`, `shared.app-identifier`)

- Play rejects bundles signed with the debug key and packages starting with
  `com.example`. Flutter's template ships both; fix before the first upload
  because the application ID is permanent.

## Not covered automatically

- Store listing text, screenshots, content rating, target audience,
  ads declaration, government/financial/health app declarations.
- Data safety form answers themselves (only signals that must be reflected).
- Pre-launch report crashes, policy on deceptive behavior, IARC ratings.
