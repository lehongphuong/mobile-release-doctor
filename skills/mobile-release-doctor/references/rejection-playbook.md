# Rejection playbook

Use this when the user pastes a rejection message. Always quote the
reviewer's words, map them to scan findings, and be explicit about what the
scanner cannot verify.

## Steps

1. **Identify**: store, guideline / policy name and number, the concrete
   complaint, device/OS mentioned, attachments (screenshots).
2. **Translate** into plain language (the user's language).
3. **Map** to scan findings (run a scan if none exists). Use the table
   below. If nothing maps, say the issue is outside automated checks.
4. **Plan**: ordered fixes; mark which need code, store-console changes,
   or a reply only.
5. **Verify** checklist before resubmitting.
6. **Reply draft** (English, short, factual): what changed, where to find
   it (navigation path), demo credentials if relevant. Never claim a fix
   that was not made. Use Resolution Center (Apple) or the appeal form /
   Policy status page (Google).

## Apple

| Message mentions | Likely cause | Related rules | Typical fix |
|---|---|---|---|
| Guideline 2.1 – App Completeness / crash / bug / placeholder | Crash on review device, placeholder content, broken login | `shared.placeholder-content`, `shared.release-version` | Reproduce on a release build, provide demo account and review notes |
| Guideline 2.1 – Information Needed / demo account | Reviewer could not log in | (config) `requires_login_for_review`, `review_demo_account_provided` | Add working demo credentials and steps to App Review Information |
| Guideline 4.2 – Minimum Functionality | Template app, web wrapper | `shared.placeholder-content` | Add native value; remove template screens |
| Guideline 5.1.1 – Purpose string / "clarify how the app uses" | Vague or missing NS…UsageDescription | `apple.permission-purpose-string`, `shared.permission-usage-evidence` | Specific purpose strings; remove unused permissions |
| Guideline 5.1.1(v) – Account deletion | No in-app deletion | `shared.account-deletion-in-app` | Add discoverable delete-account flow |
| ITMS-91053 Missing API declaration | Required reason API without manifest entry | `apple.required-reason-api` | Add category + approved reason; update SDKs |
| ITMS-90683 Missing purpose string | Linked API needs a key | `apple.permission-purpose-string` | Add the key or remove the dependency |
| ITMS-90060 / invalid CFBundleShortVersionString | Non-numeric version | `shared.release-version` | Numeric version |
| Guideline 5.1.2 / App Tracking Transparency | Tracking without ATT prompt | `apple.permission-purpose-string` (NSUserTrackingUsageDescription) | Request ATT before tracking; align App Privacy answers |
| Guideline 3.1.1 – In-App Purchase | Digital goods sold outside IAP | not covered | Use StoreKit for digital content |

## Google Play

| Message mentions | Likely cause | Related rules | Typical fix |
|---|---|---|---|
| Target API level requirement | targetSdk too low | `google.target-api-level` | Raise targetSdk |
| "signed in debug mode" / upload certificate | Debug signing | `shared.debug-configuration` | Release signing config + upload key |
| Package name not allowed / com.example | Template ID | `shared.app-identifier` | New application ID (new listing) |
| Account deletion requirements | Missing in-app or web deletion | `shared.account-deletion-in-app`, `google.account-deletion-web` | Add both, update Data safety |
| User Data policy / privacy policy | Missing / invalid policy link or disclosures | `shared.privacy-policy` | Valid policy link in console and app |
| Data safety form inaccurate | SDK collects data not declared | `shared.privacy-policy`, `google.sensitive-permissions` | Audit SDKs, update form |
| Permissions policy / background location / photo and video / SMS | Restricted permission | `google.sensitive-permissions`, `shared.permission-usage-evidence` | Remove or declare with justification |
| Foreground service permissions | Undeclared FGS types | `google.sensitive-permissions` | Declare types with video |
| Minimum functionality / spam | Template, broken or thin app | `shared.placeholder-content` | Add real functionality |

## Verification checklist (adapt per case)

- [ ] Rescan with `--baseline`; the related findings are resolved.
- [ ] Release build installed on a clean device; the reviewer's path works.
- [ ] Store console fields updated (privacy URL, Data safety, App Privacy, declarations).
- [ ] Review notes / demo account updated and tested.
- [ ] Build number increased.
