import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderJson } from "../src/reporters/json.js";
import { renderMarkdown } from "../src/reporters/markdown.js";
import { FIXTURES, scanProject } from "./helpers.js";

// Expected reports live next to the fixtures so anyone can see what the
// scanner reports for each sample project. Update with `npx vitest run -u`.
const CASES = [
  ["flutter/clean-project", "flutter-clean"],
  ["flutter/risky-project", "flutter-risky"],
  ["flutter/account-deletion-unknown", "flutter-unknown"],
  ["react-native/clean-project", "react-native-clean"],
  ["expo/clean-project", "expo-clean"],
  ["native-ios/clean-project", "native-ios-clean"],
  ["native-android/clean-project", "native-android-clean"],
] as const;

describe("report snapshots", () => {
  for (const [fixture, name] of CASES) {
    it(fixture, async () => {
      const report = scanProject(join(FIXTURES, fixture));
      await expect(renderJson(report)).toMatchFileSnapshot(join(FIXTURES, "expected", `${name}.json`));
      if (name === "flutter-risky") await expect(renderMarkdown(report)).toMatchFileSnapshot(join(FIXTURES, "expected", `${name}.md`));
    });
  }
});
