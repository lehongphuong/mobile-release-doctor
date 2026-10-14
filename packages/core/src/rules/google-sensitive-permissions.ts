import type { DraftFinding, Evidence, FindingStatus, Severity } from "../findings/types.js";
import { lineOf } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";

interface PermissionPolicy {
  permissions: string[];
  status: FindingStatus;
  severity: Severity;
  title: string;
  explanation: string;
  recommendation: string;
  ref: string;
}

const P = (n: string) => `android.permission.${n}`;

export const PERMISSION_POLICIES: PermissionPolicy[] = [
  {
    permissions: [P("ACCESS_BACKGROUND_LOCATION")],
    status: "warn",
    severity: "high",
    title: "Background location requires a Play Console declaration and review",
    explanation: "Apps that access location in the background must show the feature is core to the app, provide a prominent in-app disclosure, and submit the location permissions declaration with a video.",
    recommendation: "Remove background location unless it is essential. If it is, prepare the declaration form, a demo video, and the prominent disclosure before submitting.",
    ref: "google.background-location",
  },
  {
    permissions: ["SEND_SMS", "RECEIVE_SMS", "READ_SMS", "RECEIVE_WAP_PUSH", "RECEIVE_MMS", "READ_CALL_LOG", "WRITE_CALL_LOG", "PROCESS_OUTGOING_CALLS"].map(P),
    status: "warn",
    severity: "high",
    title: "SMS / Call Log permissions are restricted",
    explanation: "These permissions are limited to apps whose core function needs them (typically the default SMS/phone handler) and require a Permissions Declaration Form. Most other apps are rejected.",
    recommendation: "Remove them (often added by an OTP or analytics library) or use the SMS Retriever / SMS User Consent APIs. Add tools:node=\"remove\" to strip permissions merged from libraries.",
    ref: "google.sms-call-log",
  },
  {
    permissions: [P("MANAGE_EXTERNAL_STORAGE")],
    status: "warn",
    severity: "high",
    title: "All files access (MANAGE_EXTERNAL_STORAGE) is restricted",
    explanation: "Only apps whose core function needs broad file access (file managers, backup, antivirus, document management) may use it, after a declaration in Play Console.",
    recommendation: "Use the Storage Access Framework or MediaStore instead, or prepare the declaration if your app qualifies.",
    ref: "google.all-files-access",
  },
  {
    permissions: [P("QUERY_ALL_PACKAGES")],
    status: "warn",
    severity: "high",
    title: "QUERY_ALL_PACKAGES requires a qualifying use case",
    explanation: "Broad package visibility is restricted to apps that must discover all installed apps, and requires a declaration.",
    recommendation: "Replace it with <queries> entries for the specific packages or intents you need.",
    ref: "google.package-visibility",
  },
  {
    permissions: [P("REQUEST_INSTALL_PACKAGES")],
    status: "warn",
    severity: "high",
    title: "REQUEST_INSTALL_PACKAGES is restricted",
    explanation: "Installing other packages is only allowed for a limited set of core uses and needs a declaration.",
    recommendation: "Remove it unless installing APKs is the app's core function (it is often pulled in by OTA-update or file-opener plugins).",
    ref: "google.sensitive-permissions",
  },
  {
    permissions: [P("READ_MEDIA_IMAGES"), P("READ_MEDIA_VIDEO")],
    status: "warn",
    severity: "high",
    title: "Broad photo/video access needs a qualifying use or the photo picker",
    explanation: "Under Google Play's Photo and Video Permissions policy, only apps whose core functionality needs broad access to photos/videos may request READ_MEDIA_IMAGES/READ_MEDIA_VIDEO, and they must declare it. Apps with occasional needs must use the Android photo picker.",
    recommendation: "Switch to the system photo picker (image_picker on recent versions uses it) and remove the permissions, or submit the declaration if broad access is core.",
    ref: "google.photo-video-permissions",
  },
  {
    permissions: [P("USE_FULL_SCREEN_INTENT")],
    status: "needs_review",
    severity: "medium",
    title: "Full-screen intent permission needs a qualifying use",
    explanation: "From Android 14, full-screen intents are limited to calling and alarm apps; others must declare their use in Play Console.",
    recommendation: "Remove it unless the app is a calling or alarm app (some notification plugins add it).",
    ref: "google.foreground-service",
  },
  {
    permissions: [P("USE_EXACT_ALARM")],
    status: "warn",
    severity: "medium",
    title: "USE_EXACT_ALARM is limited to alarm and calendar apps",
    explanation: "Google Play only allows USE_EXACT_ALARM for apps whose core function is an alarm clock, timer, or calendar.",
    recommendation: "Use SCHEDULE_EXACT_ALARM (user-granted) or inexact alarms instead.",
    ref: "google.sensitive-permissions",
  },
];

const DATA_SAFETY_PERMISSIONS = [
  "ACCESS_FINE_LOCATION",
  "ACCESS_COARSE_LOCATION",
  "CAMERA",
  "RECORD_AUDIO",
  "READ_CONTACTS",
  "READ_PHONE_STATE",
  "READ_CALENDAR",
  "BODY_SENSORS",
  "ACTIVITY_RECOGNITION",
  "GET_ACCOUNTS",
].map(P);

export const googleSensitivePermissions: RuleCheck = {
  id: "google.sensitive-permissions",
  run({ project }) {
    const manifests = project.androidManifests();
    if (!manifests.length) return { skip: "no Android manifest (src/main) or Expo android.permissions found" };
    const findings: DraftFinding[] = [];
    const where = (perm: string): Evidence[] =>
      manifests
        .filter((m) => m.manifest.permissions.some((p) => p.name === perm && !p.removed))
        .map((m) => ({ file: m.path, line: lineOf(m.raw, perm.replace("android.permission.", "")), key: "uses-permission", value: perm, description: "Requested permission" }));

    const requested = new Set(manifests.flatMap((m) => m.manifest.permissions.filter((p) => !p.removed).map((p) => p.name)));
    for (const policy of PERMISSION_POLICIES) {
      const hits = policy.permissions.filter((p) => requested.has(p));
      if (!hits.length) continue;
      findings.push({
        status: policy.status,
        severity: policy.severity,
        confidence: "high",
        title: policy.title,
        explanation: `${policy.explanation} Requested: ${hits.map((h) => h.replace("android.permission.", "")).join(", ")}.`,
        evidence: hits.flatMap(where),
        recommendation: policy.recommendation,
        referenceIds: [policy.ref],
        key: `policy#${policy.permissions[0]}`,
      });
    }

    const fgs = [...requested].filter((p) => /^android\.permission\.FOREGROUND_SERVICE_[A-Z_]+$/.test(p));
    if (fgs.length) {
      findings.push({
        status: "needs_review",
        severity: "medium",
        confidence: "high",
        title: "Foreground service types must be declared in Play Console",
        explanation: `Apps targeting Android 14+ that use foreground services must declare each type and justify it in Play Console. Found: ${fgs.map((f) => f.replace("android.permission.", "")).join(", ")}.`,
        evidence: fgs.flatMap(where),
        recommendation: "Complete the foreground service declaration (App content > Foreground service permissions) with a description and video for each type.",
        referenceIds: ["google.foreground-service"],
        key: "fgs",
      });
    }

    const accessibility = manifests.flatMap((m) =>
      m.manifest.components
        .filter((c) => c.attrs["android:permission"] === "android.permission.BIND_ACCESSIBILITY_SERVICE")
        .map((c) => ({ file: m.path, line: lineOf(m.raw, "BIND_ACCESSIBILITY_SERVICE"), value: c.attrs["android:name"], description: "AccessibilityService declared" })),
    );
    if (accessibility.length) {
      findings.push({
        status: "warn",
        severity: "high",
        confidence: "high",
        title: "Accessibility service requires a declaration and prominent disclosure",
        explanation: "Apps that use the AccessibilityService API must declare it in Play Console and may only use it for permitted purposes.",
        evidence: accessibility,
        recommendation: "Remove the service unless it is essential; otherwise prepare the declaration and in-app disclosure.",
        referenceIds: ["google.sensitive-permissions"],
        key: "accessibility",
      });
    }

    const disclose = DATA_SAFETY_PERMISSIONS.filter((p) => requested.has(p));
    if (disclose.length) {
      findings.push({
        status: "needs_review",
        severity: "low",
        confidence: "medium",
        title: "Permissions that must be reflected in the Data safety form",
        explanation: `The app requests ${disclose.map((d) => d.replace("android.permission.", "")).join(", ")}. If the app collects or shares the related data, the Data safety form must disclose it.`,
        evidence: disclose.flatMap(where),
        recommendation: "For each permission, decide which data type it produces (e.g. precise location, photos, audio), whether it leaves the device, and declare it in Play Console > App content > Data safety.",
        referenceIds: ["google.data-safety"],
        key: "data-safety",
      });
    }
    return { findings, checked: `${requested.size} permission(s) in ${manifests.length} manifest(s); library manifests merged at build time were not inspected` };
  },
};
