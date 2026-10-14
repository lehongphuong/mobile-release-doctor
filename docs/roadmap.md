# Roadmap

Planning targets, not commitments. Priorities follow what real users report.

## 0.1.x — stabilize (now)

- Run on real open-source Flutter apps; fix false positives.
- More plugin → permission mappings (Flutter, React Native, Expo modules).
- Re-read Google Play Help pages marked `last_checked: null` in `policy/sources.yaml`.

## P1

- **Rejection Assistant** improvements: structured parsing of common
  Apple/Google messages, matched to findings (today: `references/rejection-playbook.md`).
- Privacy policy draft generated **only** from facts the developer confirms.
- Dependency health: known-problem SDK versions (offline advisory snapshot).
- Merged-manifest support: read `build/.../merged_manifests` when present.
- Optional AI explanations/patch proposals behind explicit opt-in (never by default).

## P2

- Deeper React Native, Expo, native iOS/Android rules and fixtures.
- ASO / metadata assistant based on detected features and fastlane metadata
  (character limits, misleading claims, consistency).
- HTML report for agencies and clients.
- App Store Connect / Google Play API integration with user-granted access.
- Policy change watch that flags rules needing re-verification.

Explicitly out of scope: promising approval, a single "readiness score",
auto-submitting apps, uploading source code.
