import { describe, expect, it } from "vitest";
import { findingsOf, resultOf, scanFixture } from "../helpers.js";

const ID = "shared.placeholder-content";
const F = "flutter/clean-project";

describe("positive", () => {
  it("detects the Flutter counter template, lorem ipsum and launcher label", () => {
    const titles = findingsOf(scanFixture("flutter/risky-project"), ID).map((f) => f.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "App still contains the Flutter counter template",
        "Lorem ipsum placeholder text found",
        'Launcher label looks like a package name ("health_tracker")',
        "Unfinished-feature labels found",
      ]),
    );
  });
});

describe("negative", () => {
  it("passes real app content", () => {
    expect(resultOf(scanFixture(F), ID).outcome).toBe("pass");
  });

  it("ignores Storybook screens and exception messages", () => {
    const r = scanFixture(F, {
      "lib/storybook/forms.dart": "const sample = 'Lorem ipsum dolor sit amet';\n",
      "lib/errors.dart": "throw UnimplementedError('Not implemented');\n",
    });
    expect(findingsOf(r, ID)).toEqual([]);
  });

  it("ignores placeholder text in tests and comments", () => {
    const r = scanFixture(F, {
      "test/widget_test.dart": "// Flutter Demo Home Page\nconst s = 'Lorem ipsum';\n",
      "lib/notes.dart": "// TODO: replace lorem ipsum copy before launch\nconst title = 'Notes';\n",
    });
    expect(findingsOf(r, ID)).toEqual([]);
  });
});

describe("unknown", () => {
  it("returns needs_review (not warn) for unfinished-feature labels", () => {
    const r = scanFixture(F, { "lib/soon.dart": "const label = 'Coming soon';\n" });
    expect(findingsOf(r, ID)).toEqual([expect.objectContaining({ status: "needs_review" })]);
  });
});
