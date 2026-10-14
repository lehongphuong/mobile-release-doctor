import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Diagnostic, Framework, Platform } from "../findings/types.js";
import { parseAndroidManifest, type AndroidManifest } from "../parsers/android-manifest.js";
import { parseGradle, type GradleAppModule } from "../parsers/gradle.js";
import { isDict, parsePlist, type PlistDict } from "../parsers/plist.js";
import { CONFIG_FILENAMES, projectConfigSchema, type ProjectConfig } from "./config.js";
import type { Detection } from "./detect.js";
import { walkProject } from "./walk.js";

export const MAX_TEXT_FILE_BYTES = 1_500_000;

export interface InfoPlistFile {
  path: string;
  /** For Expo managed config: the JSON path inside app.json. */
  virtualKeyPath?: string;
  data: PlistDict;
  raw: string;
  isAppTarget: boolean;
}

export interface ManifestFile {
  path: string;
  virtual?: boolean;
  manifest: AndroidManifest;
  raw: string;
}

export interface GradleFile {
  path: string;
  module: GradleAppModule;
  raw: string;
}

export interface Dependency {
  name: string;
  version?: string;
  direct: boolean;
  ecosystem: "pub" | "npm" | "gradle" | "cocoapods";
  file: string;
}

export interface PubspecInfo {
  path: string;
  name?: string;
  version?: string;
  versionLine?: number;
  raw: string;
}

export interface ExpoConfig {
  path: string;
  raw: string;
  expo: Record<string, unknown>;
  dynamicConfig?: string;
}

export type SourceKind = "dart" | "swift" | "objc" | "kotlin" | "java" | "js";

const SOURCE_EXT: Record<SourceKind, RegExp> = {
  dart: /\.dart$/,
  swift: /\.swift$/,
  objc: /\.(m|mm|h)$/,
  kotlin: /\.kts?$/,
  java: /\.java$/,
  js: /\.(js|jsx|ts|tsx|mjs|cjs)$/,
};

const GENERATED_SOURCE = /(\.g\.dart|\.freezed\.dart|\.mocks\.dart|generated_plugin_registrant\.dart|GeneratedPluginRegistrant\.(java|m|swift))$/;

function memo<T>(fn: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = fn();
      done = true;
    }
    return value;
  };
}

export class ConfigError extends Error {}

export interface ProjectContextOptions {
  root: string;
  detection: Detection;
  /** Evaluation date for time-dependent rules (deterministic tests). */
  now: Date;
  /** Path to an explicit config file; otherwise .release-doctor.yml in root is used if present. */
  configPath?: string;
  /** Use `git ls-files` to tell committed files from local ones (default true). */
  useGit?: boolean;
}

/**
 * Read-only view of a project. Everything is parsed lazily and cached,
 * and parse failures become diagnostics instead of crashing the scan.
 */
export class ProjectContext {
  readonly root: string;
  readonly framework: Framework;
  readonly platforms: Platform[];
  readonly detectionSignals: string[];
  readonly now: Date;
  readonly diagnostics: Diagnostic[] = [];
  readonly config: ProjectConfig;
  readonly configFile?: string;
  readonly files: string[];
  readonly truncated: boolean;
  private readonly textCache = new Map<string, string | undefined>();
  private readonly useGit: boolean;

  constructor(opts: ProjectContextOptions) {
    this.root = opts.root;
    this.framework = opts.detection.framework;
    this.platforms = opts.detection.platforms;
    this.detectionSignals = opts.detection.signals;
    this.now = opts.now;
    this.useGit = opts.useGit ?? true;
    const { config, file } = this.loadConfig(opts.configPath);
    this.config = config;
    this.configFile = file;
    const walk = walkProject(this.root, this.config.exclude_paths);
    this.files = walk.files;
    this.truncated = walk.truncated;
    if (walk.truncated) {
      this.diagnostics.push({ level: "warning", message: "File limit reached; some files were not scanned. Use exclude_paths to narrow the scan." });
    }
  }

  private loadConfig(explicit?: string): { config: ProjectConfig; file?: string } {
    const candidates = explicit ? [explicit] : CONFIG_FILENAMES.map((n) => join(this.root, n));
    for (const path of candidates) {
      if (!existsSync(path)) {
        if (explicit) throw new ConfigError(`config file not found: ${explicit}`);
        continue;
      }
      let data: unknown;
      try {
        data = parseYaml(readFileSync(path, "utf8")) ?? {};
      } catch (e) {
        throw new ConfigError(`${path}: invalid YAML: ${(e as Error).message}`);
      }
      const parsed = projectConfigSchema.safeParse(data);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        throw new ConfigError(`${path}: ${issues}`);
      }
      return { config: parsed.data, file: path };
    }
    return { config: projectConfigSchema.parse({}) };
  }

  hasPlatform(p: Platform): boolean {
    return this.platforms.includes(p);
  }

  exists(rel: string): boolean {
    return this.files.includes(rel);
  }

  /** Read a project file as UTF-8. Returns undefined for missing, binary or oversized files. */
  readText(rel: string): string | undefined {
    if (this.textCache.has(rel)) return this.textCache.get(rel);
    let text: string | undefined;
    try {
      const abs = join(this.root, rel);
      if (statSync(abs).size <= MAX_TEXT_FILE_BYTES) {
        const buf = readFileSync(abs);
        if (!buf.subarray(0, 8000).includes(0)) text = buf.toString("utf8");
      }
    } catch {
      text = undefined;
    }
    this.textCache.set(rel, text);
    return text;
  }

  sourceFiles(...kinds: SourceKind[]): string[] {
    const res = kinds.map((k) => SOURCE_EXT[k]);
    return this.files.filter((f) => {
      if (GENERATED_SOURCE.test(f)) return false;
      if (/(^|\/)(test|tests|integration_test|androidTest|RunnerTests|__tests__|__mocks__|__e2e__|e2e|[Ss]torybook|\.storybook)\//.test(f)) return false;
      if (/\.stories\.[jt]sx?$/.test(f)) return false;
      if (/\.(test|spec)\.[jt]sx?$/.test(f)) return false;
      if (kinds.includes("kotlin") && /\.gradle\.kts$/.test(f) && !kinds.includes("js")) return false;
      return res.some((r) => r.test(f));
    });
  }

  /** Source files that belong to the app (not tooling). */
  appSourceFiles(): string[] {
    return this.sourceFiles("dart", "swift", "objc", "kotlin", "java", "js").filter(
      (f) =>
        !/\.gradle\.kts$/.test(f) &&
        !/(^|\/)(scripts|tool|tools|metro\.config|babel\.config|jest\.config)/.test(f) &&
        !/^(\.eslintrc|app\.config|metro|babel|jest)/.test(f),
    );
  }

  diag(level: Diagnostic["level"], file: string, message: string) {
    if (!this.diagnostics.some((d) => d.file === file && d.message === message)) this.diagnostics.push({ level, file, message });
  }

  readonly pubspec = memo((): PubspecInfo | undefined => {
    const raw = this.readText("pubspec.yaml");
    if (raw === undefined) return undefined;
    try {
      const doc = (parseYaml(raw) ?? {}) as Record<string, unknown>;
      const version = doc["version"] === undefined || doc["version"] === null ? undefined : String(doc["version"]);
      const m = /^version:/m.exec(raw);
      return {
        path: "pubspec.yaml",
        name: typeof doc["name"] === "string" ? doc["name"] : undefined,
        version,
        versionLine: m ? raw.slice(0, m.index).split("\n").length : undefined,
        raw,
      };
    } catch (e) {
      this.diag("error", "pubspec.yaml", `invalid YAML: ${(e as Error).message}`);
      return undefined;
    }
  });

  readonly packageJson = memo((): Record<string, unknown> | undefined => {
    const raw = this.readText("package.json");
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      this.diag("error", "package.json", `invalid JSON: ${(e as Error).message}`);
      return undefined;
    }
  });

  readonly dependencies = memo((): Map<string, Dependency> => {
    const out = new Map<string, Dependency>();
    const add = (d: Dependency) => {
      const prev = out.get(d.name);
      if (!prev || (d.direct && !prev.direct)) out.set(d.name, d);
    };
    const pubspecRaw = this.readText("pubspec.yaml");
    if (pubspecRaw !== undefined) {
      try {
        const doc = (parseYaml(pubspecRaw) ?? {}) as Record<string, Record<string, unknown> | undefined>;
        for (const section of ["dependencies", "dev_dependencies"]) {
          for (const [name, spec] of Object.entries(doc[section] ?? {})) {
            if (name === "flutter" || name === "flutter_test") continue;
            add({
              name,
              version: typeof spec === "string" ? spec : undefined,
              direct: section === "dependencies",
              ecosystem: "pub",
              file: "pubspec.yaml",
            });
          }
        }
      } catch {
        /* reported by pubspec() */
      }
    }
    const lockRaw = this.readText("pubspec.lock");
    if (lockRaw !== undefined) {
      try {
        const lock = (parseYaml(lockRaw) ?? {}) as { packages?: Record<string, { dependency?: string; version?: string }> };
        for (const [name, p] of Object.entries(lock.packages ?? {})) {
          if (p.dependency === "direct dev") continue;
          add({ name, version: p.version, direct: p.dependency === "direct main", ecosystem: "pub", file: "pubspec.lock" });
        }
      } catch (e) {
        this.diag("warning", "pubspec.lock", `invalid YAML: ${(e as Error).message}`);
      }
    }
    const pkg = this.packageJson();
    if (pkg) {
      for (const [name, version] of Object.entries((pkg["dependencies"] ?? {}) as Record<string, string>)) {
        add({ name, version, direct: true, ecosystem: "npm", file: "package.json" });
      }
    }
    for (const g of this.gradleFiles()) {
      const re = /^\s*(?:implementation|api)\s*\(?\s*["']([\w.-]+):([\w.-]+):([^"']+)["']/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(g.raw))) add({ name: `${m[1]}:${m[2]}`, version: m[3], direct: true, ecosystem: "gradle", file: g.path });
    }
    const podLock = this.files.find((f) => /(^|\/)Podfile\.lock$/.test(f));
    if (podLock) {
      const raw = this.readText(podLock) ?? "";
      const re = /^ {2}- "?([\w./+-]+?)(?:\/[\w+-]+)? \(([^)]+)\)"?:?$/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) add({ name: m[1]!, version: m[2], direct: false, ecosystem: "cocoapods", file: podLock });
    }
    return out;
  });

  hasDependency(...names: string[]): Dependency | undefined {
    const deps = this.dependencies();
    for (const n of names) {
      const d = deps.get(n);
      if (d) return d;
    }
    return undefined;
  }

  readonly expoConfig = memo((): ExpoConfig | undefined => {
    if (this.framework !== "expo") return undefined;
    const dynamic = this.files.find((f) => /^app\.config\.(js|ts|mjs|cjs)$/.test(f));
    const raw = this.readText("app.json");
    let expo: Record<string, unknown> = {};
    if (raw !== undefined) {
      try {
        const doc = JSON.parse(raw) as Record<string, unknown>;
        expo = (doc["expo"] ?? doc) as Record<string, unknown>;
      } catch (e) {
        this.diag("error", "app.json", `invalid JSON: ${(e as Error).message}`);
      }
    }
    if (dynamic) {
      this.diag(
        "info",
        dynamic,
        "Dynamic Expo config is not executed by the scanner. Values computed there were not checked; results for Expo config may be incomplete.",
      );
    }
    if (raw === undefined && !dynamic) return undefined;
    return { path: "app.json", raw: raw ?? "", expo, dynamicConfig: dynamic };
  });

  readonly infoPlists = memo((): InfoPlistFile[] => {
    const out: InfoPlistFile[] = [];
    const candidates = this.files.filter(
      (f) => /(^|\/)Info\.plist$/.test(f) && !/(Tests?|UITests)\//.test(f) && !/(^|\/)(android|node_modules)\//.test(f),
    );
    for (const path of candidates) {
      const raw = this.readText(path);
      if (raw === undefined) {
        this.diag("warning", path, "could not read Info.plist (binary or too large)");
        continue;
      }
      try {
        const data = parsePlist(raw);
        if (!isDict(data)) {
          this.diag("error", path, "Info.plist root is not a dictionary");
          continue;
        }
        const pkgType = String(data["CFBundlePackageType"] ?? "");
        const isExtension = "NSExtension" in data || /appex|XPC!/.test(pkgType);
        const isAppTarget = !isExtension && (/APPL|PRODUCT_BUNDLE_PACKAGE_TYPE/.test(pkgType) || /(^|\/)(ios\/)?Runner\/Info\.plist$/.test(path));
        out.push({ path, data, raw, isAppTarget });
      } catch (e) {
        this.diag("error", path, `invalid property list: ${(e as Error).message}`);
      }
    }
    const expo = this.expoConfig();
    const ios = expo?.expo["ios"] as Record<string, unknown> | undefined;
    if (expo && ios && isDict(ios["infoPlist"] as PlistDict)) {
      out.push({ path: expo.path, virtualKeyPath: "expo.ios.infoPlist", data: ios["infoPlist"] as PlistDict, raw: expo.raw, isAppTarget: true });
    }
    return out;
  });

  /** App-target Info.plists; falls back to every non-extension plist when no target is marked as an app. */
  appInfoPlists(): InfoPlistFile[] {
    const all = this.infoPlists();
    const apps = all.filter((p) => p.isAppTarget);
    return apps.length ? apps : all.filter((p) => !("NSExtension" in p.data));
  }

  /** Expo project without a generated ios/ folder: native config is produced at prebuild. */
  isExpoManaged(platform: "ios" | "android"): boolean {
    return this.framework === "expo" && !this.files.some((f) => f.startsWith(`${platform}/`));
  }

  readonly androidManifests = memo((): ManifestFile[] => {
    const out: ManifestFile[] = [];
    // Debug and profile manifests only apply to non-release builds.
    const candidates = this.files.filter(
      (f) => /(^|\/)src\/main\/AndroidManifest\.xml$/.test(f) && !/(^|\/)node_modules\//.test(f),
    );
    for (const path of candidates) {
      const raw = this.readText(path);
      if (raw === undefined) continue;
      try {
        out.push({ path, manifest: parseAndroidManifest(raw), raw });
      } catch (e) {
        this.diag("error", path, `invalid AndroidManifest.xml: ${(e as Error).message}`);
      }
    }
    const expo = this.expoConfig();
    const android = expo?.expo["android"] as Record<string, unknown> | undefined;
    if (expo && android && Array.isArray(android["permissions"])) {
      const permissions = (android["permissions"] as unknown[])
        .filter((p): p is string => typeof p === "string")
        .map((p) => ({ name: p.includes(".") ? p : `android.permission.${p}`, removed: false }));
      out.push({ path: expo.path, virtual: true, raw: expo.raw, manifest: { permissions, components: [] } });
    }
    return out;
  });

  readonly gradleFiles = memo((): GradleFile[] => {
    const out: GradleFile[] = [];
    const candidates = this.files.filter((f) => /(^|\/)build\.gradle(\.kts)?$/.test(f) && !/(^|\/)node_modules\//.test(f));
    for (const path of candidates) {
      const raw = this.readText(path);
      if (raw === undefined) continue;
      try {
        out.push({ path, module: parseGradle(raw), raw });
      } catch (e) {
        this.diag("warning", path, `could not analyse Gradle file: ${(e as Error).message}`);
      }
    }
    return out;
  });

  appGradleModules(): GradleFile[] {
    return this.gradleFiles().filter((g) => g.module.isApplication);
  }

  readonly xcodeProjects = memo((): { path: string; raw: string }[] =>
    this.files
      .filter((f) => /\.xcodeproj\/project\.pbxproj$/.test(f) && !/(^|\/)Pods\//.test(f))
      .map((path) => ({ path, raw: this.readText(path) ?? "" })),
  );

  readonly gitTracked = memo((): Set<string> | undefined => {
    if (!this.useGit) return undefined;
    try {
      const out = execFileSync("git", ["-C", this.root, "ls-files", "-z", "--full-name", "."], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
        timeout: 15000,
      });
      const prefix = execFileSync("git", ["-C", this.root, "rev-parse", "--show-prefix"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 15000,
      }).trim();
      return new Set(
        out
          .split("\0")
          .filter(Boolean)
          .map((f) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f)),
      );
    } catch {
      return undefined;
    }
  });
}
