/** Patterns for values that must never appear verbatim in a report. */
export const SECRET_VALUE_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
];

/** Keep a short, non-reversible hint of a secret: prefix plus length. */
export function maskSecret(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return `[redacted ${v.length} chars]`;
  return `${v.slice(0, 4)}…[redacted ${v.length} chars]`;
}

/** Redact anything that looks like a secret inside free text. */
export function redactText(text: string): string {
  let out = text;
  for (const re of SECRET_VALUE_PATTERNS) {
    out = out.replace(new RegExp(re.source, "g"), (m) => maskSecret(m));
  }
  return out;
}
