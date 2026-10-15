import type { DraftFinding, Evidence } from "../findings/types.js";
import { maskSecret } from "../findings/redact.js";
import { lineAt } from "../parsers/text.js";
import type { RuleCheck } from "../rules-engine/types.js";

interface SecretPattern {
  id: string;
  label: string;
  re: RegExp;
  /** Unambiguous credential formats may fail; generic heuristics only warn. */
  strong: boolean;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { id: "private-key", label: "Private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/, strong: true },
  { id: "aws-access-key", label: "AWS access key ID", re: /\bAKIA[0-9A-Z]{16}\b/, strong: true },
  { id: "stripe-secret", label: "Stripe live secret key", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/, strong: true },
  { id: "github-token", label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, strong: true },
  { id: "slack-token", label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, strong: true },
  { id: "anthropic-key", label: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, strong: true },
  { id: "openai-key", label: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/, strong: true },
  { id: "service-account", label: "Google service account private key", re: /"type"\s*:\s*"service_account"[\s\S]{0,2000}"private_key"\s*:/, strong: true },
];

// The name must END with a credential term (so labels like "passwordReset" or
// "newPasswordStrength" do not match) and the value must look random.
const GENERIC_ASSIGNMENT =
  /\b([A-Za-z0-9_]*(?:secret|api[_-]?key|apikey|password|passwd|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key))\b["']?\s*[:=]\s*["']([^"'\s]{12,})["']/gi;
const RANDOM_LOOKING = (v: string) => /^[A-Za-z0-9_\-+=.]{12,}$/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v);
/** Translation catalogs contain words like "password", never credentials. */
const TRANSLATION_FILE = /(^|\/)(l10n|i18n|locales?|translations?|lang)\/|\.(arb|strings|stringsdict|po|pot|xliff?)$/i;
const PLACEHOLDER_VALUE = /^(your|xxx|change[_-]?me|example|placeholder|todo|dummy|test|sample|<|\$\{|\$\(|%)/i;
const NOT_SECRET_NAME = /public|publishable|pk_|anon|client[_-]?id|key[_-]?id|keyalias|_name$|label|hint|field/i;
const GOOGLE_API_KEY = /\bAIza[0-9A-Za-z_-]{35}\b/g;

const CREDENTIAL_FILES: { re: RegExp; label: string }[] = [
  { re: /\.(jks|keystore)$/i, label: "Android keystore" },
  { re: /\.(p12|pfx)$/i, label: "PKCS#12 certificate bundle" },
  { re: /\.p8$/i, label: "App Store Connect / APNs private key" },
  { re: /\.mobileprovision$/i, label: "Provisioning profile" },
];

const SKIP_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|pubspec\.lock|Podfile\.lock|Gemfile\.lock|\.release-doctor\.ya?ml)$|\.(min\.js|map|svg|png|jpe?g|gif|webp|ttf|otf|woff2?|ico|pdf|zip|jar|aar|so|a|dylib|framework)$/i;

function trackedState(tracked: Set<string> | undefined, file: string): "tracked" | "untracked" | "unknown" {
  if (!tracked) return "unknown";
  return tracked.has(file) ? "tracked" : "untracked";
}

export const sharedEmbeddedSecrets: RuleCheck = {
  id: "shared.embedded-secrets",
  run({ project }) {
    const findings: DraftFinding[] = [];
    const tracked = project.gitTracked();
    const googleKeys: Evidence[] = [];
    let scanned = 0;

    for (const file of project.files) {
      // Credential files: committed signing material is a real leak.
      const cred = CREDENTIAL_FILES.find((c) => c.re.test(file));
      if (cred) {
        if (/(^|\/)debug\.keystore$/.test(file)) continue;
        const state = trackedState(tracked, file);
        if (state === "untracked") continue;
        findings.push({
          status: state === "tracked" ? "fail" : "warn",
          severity: "high",
          confidence: state === "tracked" ? "high" : "medium",
          title: `${cred.label} ${state === "tracked" ? "is committed to git" : "is inside the project folder"}`,
          explanation:
            state === "tracked"
              ? `${file} is tracked by git. Anyone with repository access can sign builds or call Apple/Google APIs as you.`
              : `${file} is inside the project folder and git status is unknown. Make sure it is never committed or bundled into the app.`,
          evidence: [{ file, description: cred.label }],
          recommendation: "Remove it from the repository (and from git history), rotate the credential if it was ever pushed, and load it from a secure store in CI.",
          key: `credfile#${file}`,
        });
        continue;
      }
      if (SKIP_FILES.test(file)) continue;
      const text = project.readText(file);
      if (text === undefined) continue;
      scanned++;
      const state = trackedState(tracked, file);

      // key.properties with passwords.
      if (/(^|\/)key\.properties$/.test(file) && /storePassword\s*=/.test(text)) {
        if (state !== "untracked") {
          const idx = text.search(/storePassword\s*=/);
          findings.push({
            status: state === "tracked" ? "fail" : "warn",
            severity: "high",
            confidence: state === "tracked" ? "high" : "medium",
            title: `Signing passwords in ${file}${state === "tracked" ? " are committed" : ""}`,
            explanation: "key.properties holds the upload keystore passwords. It should stay out of version control.",
            evidence: [{ file, line: lineAt(text, idx), key: "storePassword", value: "[redacted]", description: "Keystore password" }],
            recommendation: "Add key.properties to .gitignore, remove it from git history, and rotate the passwords if they were pushed.",
            key: `keyprops#${file}`,
          });
        }
        continue;
      }

      for (const p of SECRET_PATTERNS) {
        const m = p.re.exec(text);
        if (!m) continue;
        const status = p.strong && state !== "untracked" ? "fail" : "warn";
        findings.push({
          status,
          severity: "high",
          confidence: p.strong ? "high" : "medium",
          title: `${p.label} found in ${file}`,
          explanation: `A value matching the ${p.label} format is embedded in the project${state === "tracked" ? " and tracked by git" : ""}. Anything shipped in an app binary can be extracted.`,
          evidence: [{ file, line: lineAt(text, m.index), value: maskSecret(m[0]), description: p.label }],
          recommendation: "Remove it, rotate the credential, and move privileged calls to your backend. Use CI secrets for build-time credentials.",
          key: `${p.id}#${file}`,
        });
      }

      GENERIC_ASSIGNMENT.lastIndex = 0;
      let g: RegExpExecArray | null;
      let genericInFile = 0;
      while (!TRANSLATION_FILE.test(file) && (g = GENERIC_ASSIGNMENT.exec(text)) && genericInFile < 3) {
        const [, name, value] = g as unknown as [string, string, string];
        if (!RANDOM_LOOKING(value) || NOT_SECRET_NAME.test(name) || PLACEHOLDER_VALUE.test(value) || SECRET_PATTERNS.some((p) => p.re.test(value))) continue;
        if (/^AIza/.test(value) || /^[A-Z_]+$/.test(value) || /^[a-z]+(\.[a-z]+)+$/.test(value)) continue;
        genericInFile++;
        findings.push({
          status: "warn",
          severity: "medium",
          confidence: "low",
          title: `Possible hard-coded secret "${name}" in ${file}`,
          explanation: "A credential-like name is assigned a literal value. It may be a real secret or a harmless identifier; the scanner cannot tell.",
          evidence: [{ file, line: lineAt(text, g.index), key: name, value: maskSecret(value), description: "Credential-like assignment" }],
          recommendation: "If it is a secret, move it to your backend or a CI secret. If it is public by design, add an ignore entry with the reason in .release-doctor.yml.",
          key: `generic#${file}#${name}`,
        });
      }

      GOOGLE_API_KEY.lastIndex = 0;
      const gk = GOOGLE_API_KEY.exec(text);
      if (gk) googleKeys.push({ file, line: lineAt(text, gk.index), value: maskSecret(gk[0]), description: "Google API key" });
    }

    if (googleKeys.length) {
      findings.push({
        status: "info",
        severity: "info",
        confidence: "high",
        title: "Google API keys are embedded (usually expected)",
        explanation:
          "Firebase and Google Maps keys are client identifiers meant to ship in the app, not secrets. They should still be restricted so others cannot use your quota.",
        evidence: googleKeys.slice(0, 5),
        recommendation: "In Google Cloud Console, restrict each key to your Android package/SHA-1 and iOS bundle ID and to the APIs it needs.",
        key: "google-api-keys",
      });
    }
    return { findings, checked: `${scanned} text file(s) scanned${tracked ? "" : " (git status unavailable)"}` };
  },
};
