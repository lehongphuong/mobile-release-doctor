import { describe, expect, it } from "vitest";
import { findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.account-deletion-in-app";
const F = "flutter/account-deletion-unknown";
const signup = `import 'package:firebase_auth/firebase_auth.dart';
Future<void> register(String e, String p) => FirebaseAuth.instance.createUserWithEmailAndPassword(email: e, password: p);
`;

describe("positive", () => {
  it("warns when sign-up exists but no deletion flow is found", () => {
    const r = scanFixture(F, { "lib/auth.dart": signup });
    const [f] = findingsOf(r, ID);
    expect(f).toMatchObject({ status: "warn", severity: "high", platform: "all" });
    expect(f!.evidence.some((e) => e.file === "lib/auth.dart")).toBe(true);
  });

  it("treats a developer declaration as account creation", () => {
    const r = scanFixture(F, { ".release-doctor.yml": "app:\n  has_account_creation: true\n" });
    expect(findingsOf(r, ID)[0]).toMatchObject({ status: "warn" });
  });
});

describe("negative", () => {
  it("never passes on a deletion keyword; it asks for end-to-end verification", () => {
    const r = scanFixture(F, {
      "lib/auth.dart": signup,
      "lib/settings.dart": "Future<void> deleteAccount() async { await FirebaseAuth.instance.currentUser?.delete(); }\n",
    });
    const f = findingsOf(r, ID);
    expect(f).toEqual([expect.objectContaining({ status: "needs_review", severity: "info" })]);
    expect(resultOf(r, ID).outcome).not.toBe("pass");
  });

  it("skips when the developer declares the app has no accounts", () => {
    const r = scanFixture(F, { ".release-doctor.yml": "app:\n  has_account_creation: false\n" });
    expect(resultOf(r, ID).outcome).toBe("skip");
  });
});

describe("unknown", () => {
  it("returns needs_review when account creation cannot be determined", () => {
    const r = scanFixture(F);
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "needs_review", title: "Account creation could not be determined" })]);
  });
});
