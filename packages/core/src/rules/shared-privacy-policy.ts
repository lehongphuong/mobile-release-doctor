import type { DraftFinding, Evidence } from "../findings/types.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";
import { appCodeFiles, isPlaceholderUrl, searchFiles } from "./signals.js";

/**
 * SDKs that commonly collect or share user data, with words a privacy policy
 * that covers them would plausibly contain. Whether a given SDK actually
 * collects a data type depends on its configuration; this is a prompt to
 * verify, not a conclusion.
 */
export const DATA_SDKS: { names: string[]; vendor: string; purpose: string; terms: RegExp }[] = [
  { names: ["firebase_analytics", "@react-native-firebase/analytics"], vendor: "Google Analytics for Firebase", purpose: "analytics", terms: /firebase|google analytics|analytics/i },
  { names: ["firebase_crashlytics", "@react-native-firebase/crashlytics"], vendor: "Firebase Crashlytics", purpose: "crash reporting", terms: /crashlytics|crash/i },
  { names: ["sentry_flutter", "@sentry/react-native"], vendor: "Sentry", purpose: "crash and error reporting", terms: /sentry|crash|error report/i },
  { names: ["google_mobile_ads", "react-native-google-mobile-ads"], vendor: "Google AdMob", purpose: "advertising", terms: /admob|advertis/i },
  { names: ["facebook_app_events", "flutter_facebook_auth", "react-native-fbsdk-next"], vendor: "Meta (Facebook) SDK", purpose: "analytics / login / advertising", terms: /facebook|meta/i },
  { names: ["mixpanel_flutter", "mixpanel-react-native"], vendor: "Mixpanel", purpose: "analytics", terms: /mixpanel|analytics/i },
  { names: ["amplitude_flutter", "@amplitude/analytics-react-native"], vendor: "Amplitude", purpose: "analytics", terms: /amplitude|analytics/i },
  { names: ["appsflyer_sdk", "react-native-appsflyer"], vendor: "AppsFlyer", purpose: "attribution", terms: /appsflyer|attribution/i },
  { names: ["adjust_sdk", "react-native-adjust"], vendor: "Adjust", purpose: "attribution", terms: /adjust|attribution/i },
  { names: ["onesignal_flutter", "react-native-onesignal"], vendor: "OneSignal", purpose: "push notifications", terms: /onesignal|push notification/i },
  { names: ["posthog_flutter", "posthog-react-native"], vendor: "PostHog", purpose: "analytics", terms: /posthog|analytics/i },
];

const POLICY_URL = /https?:\/\/[^\s"'`<>)]*privacy[^\s"'`<>)]*/i;

export const sharedPrivacyPolicy: RuleCheck = {
  id: "shared.privacy-policy",
  run({ project }) {
    const findings: DraftFinding[] = [];
    const urls: { url: string; evidence: Evidence }[] = [];
    const configured = project.config.app.privacy_policy_url;
    if (configured) {
      urls.push({ url: configured, evidence: { file: ".release-doctor.yml", key: "app.privacy_policy_url", value: configured, description: "Declared privacy policy URL" } });
    }
    for (const f of project.files.filter((f) => /(^|\/)fastlane\/metadata\/.*privacy_url\.txt$/.test(f))) {
      const url = project.readText(f)?.trim();
      if (url) urls.push({ url, evidence: { file: f, value: url, description: "fastlane privacy URL" } });
    }
    for (const m of searchFiles(project, appCodeFiles(project), [POLICY_URL], 3)) {
      const url = POLICY_URL.exec(m.text)?.[0];
      if (url) urls.push({ url, evidence: { file: m.file, line: m.line, value: url, description: "Privacy URL referenced in app code" } });
    }
    const docs = project.files.filter((f) => /(^|\/)(privacy[-_ ]?policy|privacy)\.(md|markdown|html?|txt)$/i.test(f) && !/(^|\/)node_modules\//.test(f));

    if (!urls.length && !docs.length) {
      findings.push({
        status: "needs_review",
        severity: "medium",
        confidence: "low",
        title: "No privacy policy found in the project",
        explanation:
          "Both stores require a privacy policy link in the store listing (App Store Connect and Play Console), and Google Play requires it to also be accessible in the app when the app handles personal data. The scanner found no policy URL or document, but the link may only exist in the store consoles.",
        evidence: [{ description: "No app.privacy_policy_url, fastlane privacy_url.txt, privacy URL in code, or privacy policy document found" }],
        recommendation: "Record the policy URL as app.privacy_policy_url in .release-doctor.yml and link it from inside the app (e.g. Settings > Privacy).",
        key: "missing",
      });
    }
    for (const { url, evidence } of urls) {
      if (isPlaceholderUrl(url)) {
        findings.push({
          status: "warn",
          severity: "high",
          confidence: "high",
          title: "Privacy policy URL looks like a placeholder",
          explanation: `"${url}" does not look like a real, public policy page.`,
          evidence: [evidence],
          recommendation: "Replace it with the public URL of your privacy policy.",
          key: `placeholder#${url}`,
        });
      } else if (url.startsWith("http://")) {
        findings.push({
          status: "warn",
          severity: "low",
          confidence: "high",
          title: "Privacy policy URL is not HTTPS",
          explanation: `"${url}" uses plain HTTP.`,
          evidence: [evidence],
          recommendation: "Serve the policy over HTTPS.",
          key: `http#${url}`,
        });
      }
    }

    // Data map: SDKs that likely collect data versus what the policy mentions.
    const sdks = DATA_SDKS.map((s) => ({ ...s, dep: s.names.map((n) => project.dependencies().get(n)).find((d) => d?.direct) })).filter((s) => s.dep);
    if (sdks.length) {
      const docText = docs.map((d) => project.readText(d) ?? "").join("\n");
      if (docs.length) {
        for (const s of sdks) {
          if (s.terms.test(docText)) continue;
          findings.push({
            status: "warn",
            severity: "medium",
            confidence: "low",
            title: `Privacy policy may not cover ${s.vendor}`,
            explanation: `The project includes ${s.dep!.name} (${s.purpose}), but ${docs.join(", ")} does not mention it or its purpose. The SDK's actual data collection depends on how it is configured.`,
            evidence: [
              { file: s.dep!.file, key: s.dep!.name, value: s.dep!.version, description: `${s.vendor} SDK` },
              { file: docs[0], line: lineOf(docText, /data/i), description: "Policy document checked" },
            ],
            recommendation: `Check ${s.vendor}'s data disclosure documentation and your configuration, then describe the data, purpose and recipient in the policy, App Privacy details and Data safety form.`,
            key: `sdk-not-in-policy#${s.vendor}`,
          });
        }
      } else {
        findings.push({
          status: "needs_review",
          severity: "low",
          confidence: "medium",
          title: "Verify privacy disclosures for data-collecting SDKs",
          explanation: `The project includes SDKs that typically collect data (${sdks.map((s) => `${s.vendor}: ${s.purpose}`).join("; ")}). The privacy policy text is not in the project, so the scanner cannot compare it.`,
          evidence: sdks.map((s) => ({ file: s.dep!.file, key: s.dep!.name, value: s.dep!.version, description: `${s.vendor} (${s.purpose})` })),
          recommendation:
            "For each SDK, confirm what it collects with your configuration and make sure the privacy policy, App Store App Privacy details and Google Play Data safety form all disclose it. Add privacy-policy.md to the repo to let the scanner compare automatically.",
          key: "sdk-disclosure",
        });
      }
    }
    return { findings, checked: `${urls.length} policy URL(s) and ${docs.length} policy document(s) found` };
  },
};
