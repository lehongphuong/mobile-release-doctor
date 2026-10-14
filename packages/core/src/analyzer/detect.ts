import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Framework, Platform } from "../findings/types.js";

export interface Detection {
  framework: Framework;
  platforms: Platform[];
  /** Why the framework was chosen; shown in reports. */
  signals: string[];
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function hasXcodeProject(dir: string): boolean {
  try {
    return readdirSync(dir).some((n) => n.endsWith(".xcodeproj") || n.endsWith(".xcworkspace"));
  } catch {
    return false;
  }
}

function isAndroidAppDir(dir: string): boolean {
  return (
    (existsSync(join(dir, "settings.gradle")) || existsSync(join(dir, "settings.gradle.kts"))) &&
    (existsSync(join(dir, "app", "build.gradle")) || existsSync(join(dir, "app", "build.gradle.kts")))
  );
}

/** Detect the framework of the project rooted exactly at `root`. Returns undefined if unsupported. */
export function detectFramework(root: string): Detection | undefined {
  const pubspecPath = join(root, "pubspec.yaml");
  if (existsSync(pubspecPath)) {
    let pubspec: Record<string, unknown> | undefined;
    try {
      pubspec = parseYaml(readFileSync(pubspecPath, "utf8")) as Record<string, unknown>;
    } catch {
      pubspec = undefined;
    }
    const deps = (pubspec?.["dependencies"] ?? {}) as Record<string, unknown>;
    const flutterDep = deps["flutter"] as Record<string, unknown> | undefined;
    if (flutterDep && flutterDep["sdk"] === "flutter") {
      const platforms: Platform[] = [];
      if (existsSync(join(root, "ios"))) platforms.push("ios");
      if (existsSync(join(root, "android"))) platforms.push("android");
      return { framework: "flutter", platforms, signals: ["pubspec.yaml depends on the Flutter SDK"] };
    }
  }

  const pkg = readJson(join(root, "package.json"));
  if (pkg) {
    const deps = { ...(pkg["dependencies"] as object), ...(pkg["devDependencies"] as object) } as Record<string, string>;
    const hasIos = existsSync(join(root, "ios"));
    const hasAndroid = existsSync(join(root, "android"));
    if (deps["expo"]) {
      const signals = ["package.json depends on expo"];
      if (hasIos || hasAndroid) signals.push("native ios/ or android/ folders present (prebuild or bare workflow)");
      return { framework: "expo", platforms: ["ios", "android"], signals };
    }
    if (deps["react-native"]) {
      const platforms: Platform[] = [];
      if (hasIos) platforms.push("ios");
      if (hasAndroid) platforms.push("android");
      return { framework: "react-native", platforms, signals: ["package.json depends on react-native"] };
    }
  }

  if (hasXcodeProject(root)) {
    return { framework: "native-ios", platforms: ["ios"], signals: ["Xcode project found at the project root"] };
  }
  if (isAndroidAppDir(root)) {
    return {
      framework: "native-android",
      platforms: ["android"],
      signals: ["settings.gradle and app/build.gradle found at the project root"],
    };
  }
  return undefined;
}

/** For monorepos: find supported projects up to `depth` levels below root. */
export function findCandidateProjects(root: string, depth = 3): { path: string; framework: Framework }[] {
  const out: { path: string; framework: Framework }[] = [];
  const skip = new Set(["node_modules", ".git", "build", "Pods", ".dart_tool", "fixtures", "test", "tests"]);
  const visit = (rel: string, level: number) => {
    if (level > depth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || skip.has(e.name)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const d = detectFramework(join(root, childRel));
      if (d) out.push({ path: childRel, framework: d.framework });
      else visit(childRel, level + 1);
    }
  };
  visit("", 1);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
