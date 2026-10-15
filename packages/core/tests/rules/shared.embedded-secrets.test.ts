import { describe, expect, it } from "vitest";
import { renderJson } from "../../src/reporters/json.js";
import { renderMarkdown } from "../../src/reporters/markdown.js";
import { fake, findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.embedded-secrets";
const F = "flutter/clean-project";

describe("positive", () => {
  it("fails strong credential formats and never prints the value", () => {
    const aws = fake.awsKey();
    const stripe = fake.stripeLive();
    const r = scanFixture(F, { "lib/keys.dart": `const a = "${aws}";\nconst b = "${stripe}";\n`, "android/app/upload.pem": fake.privateKeyBlock() });
    const f = findingsOf(r, ID);
    expect(f.filter((x) => x.status === "fail").map((x) => x.title).sort()).toEqual([
      "AWS access key ID found in lib/keys.dart",
      "Private key found in android/app/upload.pem",
      "Stripe live secret key found in lib/keys.dart",
    ]);
    for (const out of [renderJson(r), renderMarkdown(r)]) {
      expect(out).not.toContain(aws);
      expect(out).not.toContain(stripe);
      expect(out).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC");
    }
  });

  it("flags committed signing material when git status is unknown", () => {
    const r = scanFixture(F, { "android/app/upload-keystore.jks": "binary", "android/key.properties": "storePassword=hunter2hunter2\n" });
    expect(findingsOf(r, ID).map((x) => [x.status, x.title])).toEqual(
      expect.arrayContaining([
        ["warn", "Android keystore is inside the project folder"],
        ["warn", "Signing passwords in android/key.properties"],
      ]),
    );
  });

  it("warns (not fails) on generic credential-like assignments", () => {
    const r = scanFixture(F, { "lib/env.dart": 'const paymentApiSecret = "Q9w8E7r6T5y4U3i2O1p0";\n' });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "warn", confidence: "low" })]);
  });
});

describe("negative", () => {
  it("reports Google API keys only as info", () => {
    const r = scanFixture(F, { "lib/firebase_options.dart": `const apiKey = '${fake.googleApiKey()}';\n` });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "info", severity: "info" })]);
  });

  it("ignores translation strings and labels that merely mention passwords (seen in real apps)", () => {
    const r = scanFixture(F, {
      "lib/l10n/app_de.arb": '{ "newPasswordStrength": "Passwortstärke", "password": "Passwort1234567" }\n',
      "lib/routes.dart": "const changePassword = 'ChangePassword';\nconst appPasswords = '/settings/app-passwords';\nconst apiKeyPath = 'secrets/api-key-0001.p8';\n",
    });
    expect(findingsOf(r, ID)).toEqual([]);
  });

  it("ignores placeholders, env lookups and the debug keystore", () => {
    const r = scanFixture(F, {
      "lib/env.dart": 'const apiKey = "YOUR_API_KEY_HERE";\nconst token = "${TOKEN_FROM_ENV}";\nconst clientId = "1234567890-abcdefghijkl";\n',
      "android/app/debug.keystore": "binary",
    });
    expect(findingsOf(r, ID)).toEqual([]);
    expect(resultOf(r, ID).outcome).toBe("pass");
  });
});

describe("unknown", () => {
  it("says when git status could not be used", () => {
    expect(resultOf(scanFixture(F), ID).reason).toContain("git status unavailable");
  });
});
