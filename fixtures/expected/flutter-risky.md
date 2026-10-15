# Mobile Release Doctor report — health_tracker

> Automated checks cannot guarantee App Store or Google Play approval. Passing rules mean no issue was detected with the available evidence; items marked needs_review require a human decision.

**🔴 Blocking issues found** — 5 issue(s) with clear evidence must be fixed before release.

| | |
|---|---|
| Project | health_tracker · flutter · ios, android |
| Findings | 5 fail · 19 warn · 5 needs review · 0 info |
| Rules | 0 pass · 14 with findings · 0 skipped · 0 errors |
| Fail threshold | `high` → **exceeded** |
| Policy snapshot | 2026.10.14 (verified 2026-10-14) |
| Evaluated on | 2026-10-14 · tool 0.1.0 · offline, no AI |

## Findings

### Must fix before release (5)

_Clear evidence of a violation or technical defect._

#### FAIL · ERROR — targetSdk 34 is below Google Play's requirement (API 36)

`google.target-api-level` · platform: android · confidence: high · verification: config-parse · id: `987bd6f1ff2b`

Since 2026-08-31, new apps and app updates (phone-tablet) must target API level 36 or higher to be submitted. Play Console will reject this upload.

**Evidence**

- `android/app/build.gradle:14` — Target SDK `targetSdk` = `34`

**Next step:** Raise targetSdk to 36 or higher, review the Android behavior changes for each version you skip, and update plugins that pin older SDKs.

**Sources:** [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk) · [Target API level requirements for Google Play apps (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/11926878)

#### FAIL · ERROR — Android application ID uses the reserved prefix "com.example" (com.example.health_tracker)

`shared.app-identifier` · platform: android · confidence: high · verification: config-parse · id: `0634be017e42`

Google Play does not accept packages that start with com.example. The application ID is permanent once the app is published.

**Evidence**

- `android/app/build.gradle:12` — Android application ID `applicationId` = `com.example.health_tracker`

**Next step:** Choose a reverse-domain ID you own (e.g. com.yourcompany.app), set applicationId, and update namespace, MainActivity package and Firebase/Google config files to match.

**Sources:** [Configure the app module (application ID)](https://developer.android.com/build/configure-app-module)

#### FAIL · ERROR — Version name "1.3.0-beta" is not a valid App Store version

`shared.release-version` · platform: ios · confidence: high · verification: config-parse · id: `27e45f0ce1a4`

Version name must be one to three period-separated integers (e.g. 1.4.2). App Store Connect rejects uploads with suffixes such as -beta or letters.

**Evidence**

- `pubspec.yaml:4` — Flutter app version `version` = `1.3.0-beta+7`

**Next step:** Use a plain numeric version (e.g. 1.4.2) and put pre-release labels in the build number or release notes instead.

**Sources:** [CFBundleShortVersionString](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring)

#### FAIL · HIGH — Empty purpose string: NSCameraUsageDescription

`apple.permission-purpose-string` · platform: ios · confidence: high · verification: config-parse · id: `c109e30c118f`

NSCameraUsageDescription is declared but has no text. iOS shows this string in the permission prompt, and App Review rejects prompts that do not explain the purpose.

**Evidence**

- `ios/Runner/Info.plist:13` — Purpose string is empty `NSCameraUsageDescription` = ``

**Next step:** Write a specific sentence describing what the app does with this access, e.g. "Scan receipts to add expenses." Remove the key if the feature does not exist.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [Information Property List (purpose strings / usage descriptions)](https://developer.apple.com/documentation/bundleresources/information-property-list)

#### FAIL · HIGH — Release build is signed with the debug key

`shared.debug-configuration` · platform: android · confidence: high · verification: config-parse · id: `5bd0edd8e87c`

The release build type uses signingConfigs.debug (the default in new Flutter projects). Google Play rejects bundles signed with a debug certificate, and the debug key is not yours to keep.

**Evidence**

- `android/app/build.gradle:23` — Release signing config `buildTypes.release.signingConfig` = `signingConfigs.debug`

**Next step:** Create an upload keystore, reference it from a release signingConfig loaded from key.properties (kept out of git), and enroll in Play App Signing.

**Sources:** [Sign your app](https://developer.android.com/studio/publish/app-signing)

### Risks to fix or verify (19)

_Signals that something is wrong; confirm and fix._

#### WARN · HIGH — Required reason APIs used without an app privacy manifest

`apple.required-reason-api` · platform: ios · confidence: medium · verification: config-parse · id: `ca0cebb3aef1`

App-owned iOS code appears to use User defaults APIs, but no PrivacyInfo.xcprivacy was found. Apple requires apps to declare approved reasons for these APIs; uploads without them receive ITMS-91053.

**Evidence**

- `ios/Runner/AppDelegate.swift:10` — User defaults API (NSPrivacyAccessedAPICategoryUserDefaults) `let launches = UserDefaults.standard.integer(forKey: "launchCount")`
- `ios/Runner/AppDelegate.swift:11` — User defaults API (NSPrivacyAccessedAPICategoryUserDefaults) `UserDefaults.standard.set(launches + 1, forKey: "launchCount")`

**Next step:** Add PrivacyInfo.xcprivacy to the app target (Xcode: File > New > File > App Privacy) and declare each category with the reason code that matches your use.

**Sources:** [Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) · [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)

#### WARN · HIGH — No web account deletion URL declared

`google.account-deletion-web` · platform: android · confidence: medium · verification: developer-declared · id: `b06e530f1b73`

Google Play requires apps that allow account creation to provide a web link where users can request account and data deletion without reinstalling the app. The link is entered in the Data safety form; the scanner cannot see Play Console, so it relies on your declaration.

**Evidence**

- `pubspec.yaml` — Direct dependency firebase_auth `firebase_auth` = `^5.3.1`
- `lib/auth.dart:7` — Sign-up signal `return _auth.createUserWithEmailAndPassword(email: email, password: password);`
- `.release-doctor.yml` — Not declared `app.account_deletion.web_url`

**Next step:** Publish a page that explains how to request deletion (and what data is deleted or retained), enter it in Play Console > App content > Data safety, and record it as app.account_deletion.web_url.

**Sources:** [Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111) · [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469)

#### WARN · HIGH — Background location requires a Play Console declaration and review

`google.sensitive-permissions` · platform: android · confidence: high · verification: config-parse · id: `33f3e36178f5`

Apps that access location in the background must show the feature is core to the app, provide a prominent in-app disclosure, and submit the location permissions declaration with a video. Requested: ACCESS_BACKGROUND_LOCATION.

**Evidence**

- `android/app/src/main/AndroidManifest.xml:4` — Requested permission `uses-permission` = `android.permission.ACCESS_BACKGROUND_LOCATION`

**Next step:** Remove background location unless it is essential. If it is, prepare the declaration form, a demo video, and the prominent disclosure before submitting.

**Sources:** [Requesting access to location in the background](https://support.google.com/googleplay/android-developer/answer/9799150)

#### WARN · HIGH — Broad photo/video access needs a qualifying use or the photo picker

`google.sensitive-permissions` · platform: android · confidence: high · verification: config-parse · id: `37b47be88ed2`

Under Google Play's Photo and Video Permissions policy, only apps whose core functionality needs broad access to photos/videos may request READ_MEDIA_IMAGES/READ_MEDIA_VIDEO, and they must declare it. Apps with occasional needs must use the Android photo picker. Requested: READ_MEDIA_IMAGES.

**Evidence**

- `android/app/src/main/AndroidManifest.xml:5` — Requested permission `uses-permission` = `android.permission.READ_MEDIA_IMAGES`

**Next step:** Switch to the system photo picker (image_picker on recent versions uses it) and remove the permissions, or submit the declaration if broad access is core.

**Sources:** [Google Play's Photo and Video Permissions policy](https://support.google.com/googleplay/android-developer/answer/14115180)

#### WARN · HIGH — App appears to create accounts but no in-app deletion flow was found

`shared.account-deletion-in-app` · platform: all · confidence: medium · verification: source-heuristic · id: `43b83933a0d7`

Both Apple (Guideline 5.1.1(v)) and Google Play require apps that support account creation to let users initiate account deletion from within the app. The scanner found account-creation signals but no deletion flow.

**Evidence**

- `pubspec.yaml` — Direct dependency firebase_auth `firebase_auth` = `^5.3.1`
- `lib/auth.dart:7` — Sign-up / registration signal `return _auth.createUserWithEmailAndPassword(email: email, password: password);`

**Next step:** Add a clearly labelled “Delete account” action (e.g. in Settings > Account) that deletes the account and associated data, then record the path in .release-doctor.yml (app.account_deletion.in_app_path).

**Sources:** [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/) · [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)

#### WARN · HIGH — iOS bundle identifier is still the template value (com.example.healthTracker)

`shared.app-identifier` · platform: ios · confidence: high · verification: config-parse · id: `cc049cf31b2c`

com.example identifiers come from project templates. The bundle ID must match an App ID registered to your team and cannot be changed after release.

**Evidence**

- `ios/Runner.xcodeproj/project.pbxproj:8` — iOS bundle identifier `PRODUCT_BUNDLE_IDENTIFIER` = `com.example.healthTracker`

**Next step:** Register your own bundle ID in the Apple Developer portal and set PRODUCT_BUNDLE_IDENTIFIER for the app target and its extensions.

**Sources:** [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

#### WARN · HIGH — Signing passwords in android/key.properties

`shared.embedded-secrets` · platform: all · confidence: medium · verification: deterministic · id: `b89bb6d293f2`

key.properties holds the upload keystore passwords. It should stay out of version control.

**Evidence**

- `android/key.properties:1` — Keystore password `storePassword` = `[redacted]`

**Next step:** Add key.properties to .gitignore, remove it from git history, and rotate the passwords if they were pushed.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [User Data policy (privacy policy requirements)](https://support.google.com/googleplay/android-developer/answer/10144311)

#### WARN · HIGH — App still contains the Flutter counter template

`shared.placeholder-content` · platform: all · confidence: medium · verification: source-heuristic · id: `9fb38828141a`

Template screens indicate the app may be incomplete. Apple rejects incomplete apps (Guideline 2.1) and apps with minimal functionality (4.2); Google Play has a similar minimum functionality policy.

**Evidence**

- `lib/main.dart:14` — Template text `home: const MyHomePage(title: 'Flutter Demo Home Page'),`
- `lib/main.dart:40` — Template text `const Text('You have pushed the button this many times:'),`

**Next step:** Remove the template screen and make sure the release build opens to real app content.

**Sources:** [App Review Guidelines 2.1 – App Completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness) · [App Review Guidelines 4.2 – Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality) · [Spam and Minimum Functionality policy](https://support.google.com/googleplay/android-developer/answer/9898783)

#### WARN · HIGH — Privacy policy URL looks like a placeholder

`shared.privacy-policy` · platform: all · confidence: high · verification: developer-declared · id: `5f36ac27a908`

"https://example.com/privacy" does not look like a real, public policy page.

**Evidence**

- `.release-doctor.yml` — Declared privacy policy URL `app.privacy_policy_url` = `https://example.com/privacy`

**Next step:** Replace it with the public URL of your privacy policy.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/) · [User Data policy (privacy policy requirements)](https://support.google.com/googleplay/android-developer/answer/10144311) · [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469)

#### WARN · MEDIUM — Purpose string needs review: NSContactsUsageDescription

`apple.permission-purpose-string` · platform: ios · confidence: medium · verification: config-parse · id: `548ab5f4c3be`

The text for NSContactsUsageDescription does not explain how the app uses the data. Apple expects the prompt to state clearly and completely why the app needs the access.

**Evidence**

- `ios/Runner/Info.plist:17` — Current purpose string `NSContactsUsageDescription` = `This app needs access to your contacts`

**Next step:** Describe the concrete feature that uses this access, in the language of the app's UI, and localize it via InfoPlist.strings when the app is localized.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [Information Property List (purpose strings / usage descriptions)](https://developer.apple.com/documentation/bundleresources/information-property-list)

#### WARN · MEDIUM — Purpose string needs review: NSLocationWhenInUseUsageDescription

`apple.permission-purpose-string` · platform: ios · confidence: medium · verification: config-parse · id: `cb2ad98ea459`

The text for NSLocationWhenInUseUsageDescription is too short to explain the purpose. Apple expects the prompt to state clearly and completely why the app needs the access.

**Evidence**

- `ios/Runner/Info.plist:15` — Current purpose string `NSLocationWhenInUseUsageDescription` = `Location`

**Next step:** Describe the concrete feature that uses this access, in the language of the app's UI, and localize it via InfoPlist.strings when the app is localized.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [Information Property List (purpose strings / usage descriptions)](https://developer.apple.com/documentation/bundleresources/information-property-list)

#### WARN · MEDIUM — Cleartext (HTTP) traffic is allowed for all domains

`shared.debug-configuration` · platform: android · confidence: high · verification: config-parse · id: `0cc5ce28dc48`

android:usesCleartextTraffic="true" in src/main enables unencrypted traffic in release builds.

**Evidence**

- `android/app/src/main/AndroidManifest.xml:8` — <application> attribute `android:usesCleartextTraffic` = `true`

**Next step:** Remove it, or use a network security config that allows cleartext only for the specific domains that need it (and only in debug if possible).

**Sources:** [Security risk: cleartext communications](https://developer.android.com/privacy-and-security/risks/cleartext-communications)

#### WARN · MEDIUM — App Transport Security is disabled (NSAllowsArbitraryLoads)

`shared.debug-configuration` · platform: ios · confidence: high · verification: config-parse · id: `377164a042bc`

NSAllowsArbitraryLoads turns off HTTPS enforcement for all connections. App Review may ask for a justification, and it is often a leftover from development.

**Evidence**

- `ios/Runner/Info.plist:21` — ATS exception `NSAppTransportSecurity.NSAllowsArbitraryLoads` = `true`

**Next step:** Remove it and add NSExceptionDomains only for hosts that cannot use HTTPS, or move the exception to a debug-only Info.plist.

**Sources:** [NSAppTransportSecurity](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity)

#### WARN · MEDIUM — Possible hard-coded secret "backendApiSecret" in lib/config.dart

`shared.embedded-secrets` · platform: all · confidence: low · verification: deterministic · id: `5e83421520b9`

A credential-like name is assigned a literal value. It may be a real secret or a harmless identifier; the scanner cannot tell.

**Evidence**

- `lib/config.dart:2` — Credential-like assignment `backendApiSecret` = `q8Zt…[redacted 24 chars]`

**Next step:** If it is a secret, move it to your backend or a CI secret. If it is public by design, add an ignore entry with the reason in .release-doctor.yml.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [User Data policy (privacy policy requirements)](https://support.google.com/googleplay/android-developer/answer/10144311)

#### WARN · MEDIUM — Lorem ipsum placeholder text found

`shared.placeholder-content` · platform: all · confidence: medium · verification: source-heuristic · id: `a3a39557e40c`

Placeholder text in shipped screens is a common App Completeness rejection reason. Matches in unused code or tests are harmless.

**Evidence**

- `lib/main.dart:42` — Placeholder text `const Text('Lorem ipsum dolor sit amet'),`

**Next step:** Replace placeholder text with final copy, or confirm these strings are not reachable in the release build.

**Sources:** [App Review Guidelines 2.1 – App Completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness) · [App Review Guidelines 4.2 – Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality) · [Spam and Minimum Functionality policy](https://support.google.com/googleplay/android-developer/answer/9898783)

#### WARN · MEDIUM — Privacy policy may not cover Google Analytics for Firebase

`shared.privacy-policy` · platform: all · confidence: low · verification: developer-declared · id: `b80e4dfa45c5`

The project includes firebase_analytics (analytics), but privacy-policy.md does not mention it or its purpose. The SDK's actual data collection depends on how it is configured.

**Evidence**

- `pubspec.yaml` — Google Analytics for Firebase SDK `firebase_analytics` = `^11.3.3`
- `privacy-policy.md` — Policy document checked

**Next step:** Check Google Analytics for Firebase's data disclosure documentation and your configuration, then describe the data, purpose and recipient in the policy, App Privacy details and Data safety form.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/) · [User Data policy (privacy policy requirements)](https://support.google.com/googleplay/android-developer/answer/10144311) · [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469)

#### WARN · MEDIUM — Hard-coded versionName overrides pubspec.yaml

`shared.release-version` · platform: android · confidence: high · verification: config-parse · id: `b303efd45a0a`

build.gradle sets versionName "1.3.0" but pubspec.yaml says 1.3.0-beta.

**Evidence**

- `android/app/build.gradle:16` — Hard-coded in Gradle `versionName` = `"1.3.0"`

**Next step:** Use `versionName flutter.versionName`.

**Sources:** [Version your app](https://developer.android.com/studio/publish/versioning)

#### WARN · MEDIUM — Hard-coded versionCode overrides pubspec.yaml

`shared.release-version` · platform: android · confidence: high · verification: config-parse · id: `ee71c224926f`

build.gradle sets versionCode 3, but pubspec.yaml says build 7. Bumping pubspec.yaml will not change the Android build, which leads to "version code already used" upload errors.

**Evidence**

- `android/app/build.gradle:15` — Hard-coded in Gradle `versionCode` = `3`
- `pubspec.yaml:4` — pubspec.yaml version `version` = `1.3.0-beta+7`

**Next step:** Use `versionCode flutter.versionCode` (Groovy) or `versionCode = flutter.versionCode` (Kotlin DSL).

**Sources:** [Version your app](https://developer.android.com/studio/publish/versioning)

#### WARN · LOW — Launcher label looks like a package name ("health_tracker")

`shared.placeholder-content` · platform: android · confidence: medium · verification: source-heuristic · id: `2605975256b5`

Project templates set the launcher label to the project's snake_case name; it is what users see under the icon.

**Evidence**

- `android/app/src/main/AndroidManifest.xml:7` — <application android:label> `android:label` = `health_tracker`

**Next step:** Set android:label to the app's display name (or a @string resource).

**Sources:** [App Review Guidelines 2.1 – App Completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness) · [App Review Guidelines 4.2 – Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality) · [Spam and Minimum Functionality policy](https://support.google.com/googleplay/android-developer/answer/9898783)

### Needs manual review (5)

_Cannot be verified automatically; a human must decide._

#### NEEDS REVIEW · MEDIUM — Photo library permission may be unnecessary

`shared.permission-usage-evidence` · platform: all · confidence: low · verification: source-heuristic · id: `a14505fb0137`

The app declares photo library access, but the scanner found no known photo library dependency or API call in the scanned sources. This needs verification; it is not proof of a policy violation.

**Evidence**

- `android/app/src/main/AndroidManifest.xml:5` — Declared Android permission `android.permission.READ_MEDIA_IMAGES`
- No photo library dependency or API usage found in 4 scanned source file(s)

**Next step:** Confirm which feature or dependency uses photo library. If none does, remove the permission and its purpose string; both stores reject or question permissions the app does not need.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [Permissions and APIs that Access Sensitive Information](https://support.google.com/googleplay/android-developer/answer/9888170)

#### NEEDS REVIEW · MEDIUM — Contacts permission may be unnecessary

`shared.permission-usage-evidence` · platform: all · confidence: low · verification: source-heuristic · id: `e7314c585d23`

The app declares contacts access, but the scanner found no known contacts dependency or API call in the scanned sources. This needs verification; it is not proof of a policy violation.

**Evidence**

- `ios/Runner/Info.plist:17` — Declared iOS purpose string `NSContactsUsageDescription`
- No contacts dependency or API usage found in 4 scanned source file(s)

**Next step:** Confirm which feature or dependency uses contacts. If none does, remove the permission and its purpose string; both stores reject or question permissions the app does not need.

**Sources:** [App Review Guidelines 5.1.1 – Data Collection and Storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) · [Permissions and APIs that Access Sensitive Information](https://support.google.com/googleplay/android-developer/answer/9888170)

#### NEEDS REVIEW · MEDIUM — Confirm reviewers can sign in

`shared.review-access` · platform: all · confidence: low · verification: developer-declared · id: `df433a028fc0`

The app appears to have accounts. If any feature requires signing in, reviewers need working credentials or a demo mode.

**Evidence**

- `pubspec.yaml` — Direct dependency firebase_auth `firebase_auth` = `^5.3.1`
- `lib/auth.dart:7` — Sign-up / login signal `return _auth.createUserWithEmailAndPassword(email: email, password: password);`

**Next step:** Set app.requires_login_for_review and app.review_demo_account_provided in .release-doctor.yml after preparing the reviewer account.

**Sources:** [App Review Guidelines 2.1 – App Completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness)

#### NEEDS REVIEW · LOW — Permissions that must be reflected in the Data safety form

`google.sensitive-permissions` · platform: android · confidence: medium · verification: config-parse · id: `cde33fb6411f`

The app requests ACCESS_FINE_LOCATION, CAMERA. If the app collects or shares the related data, the Data safety form must disclose it.

**Evidence**

- `android/app/src/main/AndroidManifest.xml:3` — Requested permission `uses-permission` = `android.permission.ACCESS_FINE_LOCATION`
- `android/app/src/main/AndroidManifest.xml:2` — Requested permission `uses-permission` = `android.permission.CAMERA`

**Next step:** For each permission, decide which data type it produces (e.g. precise location, photos, audio), whether it leaves the device, and declare it in Play Console > App content > Data safety.

**Sources:** [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469)

#### NEEDS REVIEW · LOW — Unfinished-feature labels found

`shared.placeholder-content` · platform: all · confidence: low · verification: source-heuristic · id: `6a84a99059ad`

Labels such as “Coming soon” suggest features that reviewers cannot use. Reviewers may treat visible placeholders as incomplete functionality.

**Evidence**

- `lib/main.dart:43` — Unfinished feature label `const Text('Coming soon'),`

**Next step:** Hide unfinished features in release builds (feature flags) rather than showing placeholder screens or buttons.

**Sources:** [App Review Guidelines 2.1 – App Completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness) · [App Review Guidelines 4.2 – Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality) · [Spam and Minimum Functionality policy](https://support.google.com/googleplay/android-developer/answer/9898783)

## Rule results

| Rule | Outcome | Details |
|---|---|---|
| `google.account-deletion-web` Web link for account deletion requests is declared | warn (1) |  |
| `google.sensitive-permissions` Sensitive Android permissions have a policy path | warn (3) |  |
| `google.target-api-level` targetSdk meets Google Play's current requirement | fail (1) |  |
| `apple.permission-purpose-string` Permission purpose strings are present and specific | fail (3) |  |
| `apple.required-reason-api` Required reason APIs are declared in the privacy manifest | warn (1) |  |
| `shared.account-deletion-in-app` Apps with account creation offer in-app account deletion | warn (1) |  |
| `shared.app-identifier` Application ID and bundle identifier are not template values | fail (2) |  |
| `shared.debug-configuration` Release builds do not use debug configuration | fail (3) |  |
| `shared.embedded-secrets` No credentials embedded in the project | warn (2) |  |
| `shared.permission-usage-evidence` Declared permissions have a matching feature | needs_review (2) |  |
| `shared.placeholder-content` No template or placeholder content | warn (4) |  |
| `shared.privacy-policy` Privacy policy is available and covers detected SDKs | warn (2) |  |
| `shared.release-version` Version name and build number are valid and consistent | fail (3) |  |
| `shared.review-access` Reviewers can access account-based features | needs_review (1) |  |
