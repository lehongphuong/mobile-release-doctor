import { lineAt, stripCLikeComments } from "./text.js";

/**
 * Gradle build files are programs, not data. This module extracts a few
 * well-known assignments without evaluating anything. Values that are not
 * literals are reported as expressions so rules can return needs_review.
 */
export interface GradleValue {
  raw: string;
  /** Present when the value is a plain literal. */
  literal?: string | number | boolean;
  line: number;
}

export interface GradleBuildType {
  name: string;
  line: number;
  signingConfig?: GradleValue;
  debuggable?: GradleValue;
  minifyEnabled?: GradleValue;
}

export interface GradleAppModule {
  isApplication: boolean;
  applicationId?: GradleValue;
  namespace?: GradleValue;
  targetSdk?: GradleValue;
  minSdk?: GradleValue;
  compileSdk?: GradleValue;
  versionCode?: GradleValue;
  versionName?: GradleValue;
  buildTypes: GradleBuildType[];
  hasReleaseBuildType: boolean;
}

interface Block {
  bodyStart: number;
  bodyEnd: number;
}

function matchBrace(text: string, open: number): number {
  let depth = 0;
  let inString: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") inString = c;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findBlocks(text: string, header: RegExp, within?: Block): (Block & { headerIndex: number; name: string })[] {
  const out: (Block & { headerIndex: number; name: string })[] = [];
  const start = within?.bodyStart ?? 0;
  const end = within?.bodyEnd ?? text.length;
  const slice = text.slice(start, end);
  const re = new RegExp(header.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice))) {
    const open = start + m.index + m[0].length - 1;
    if (text[open] !== "{") continue;
    const close = matchBrace(text, open);
    if (close < 0) continue;
    out.push({ headerIndex: start + m.index, bodyStart: open + 1, bodyEnd: close, name: m[1] ?? "" });
    re.lastIndex = close - start;
  }
  return out;
}

function parseLiteral(raw: string): string | number | boolean | undefined {
  const v = raw.trim();
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v === "true" || v === "false") return v === "true";
  const s = /^"([^"$]*)"$/.exec(v) ?? /^'([^']*)'$/.exec(v);
  if (s) return s[1];
  return undefined;
}

function findAssignment(text: string, keys: string[], within?: Block): GradleValue | undefined {
  const start = within?.bodyStart ?? 0;
  const end = within?.bodyEnd ?? text.length;
  const slice = text.slice(start, end);
  // Matches `key value`, `key = value` and `key(value)` at the start of a line.
  const re = new RegExp(`^[ \\t]*(?:${keys.join("|")})\\b[ \\t]*(=[ \\t]*|\\(|[ \\t]+)([^\\n]*?)[ \\t]*;?[ \\t]*$`, "m");
  const m = re.exec(slice);
  if (!m) return undefined;
  let raw = m[2]!.trim();
  if (m[1] === "(" && raw.endsWith(")")) raw = raw.slice(0, -1).trim();
  return { raw, literal: parseLiteral(raw), line: lineAt(text, start + m.index + (m[0].length - m[0].trimStart().length)) };
}

/** Returns blocks at depth 1 below `within` only (ignores nested ones like android.defaultConfig.ndk). */
function topLevelBlocks(text: string, header: RegExp, within?: Block) {
  return findBlocks(text, header, within);
}

export function parseGradle(original: string): GradleAppModule {
  const text = stripCLikeComments(original);
  const isApplication =
    /com\.android\.application/.test(text) || /\bapplicationId\b/.test(text);
  const android = topLevelBlocks(text, /\bandroid\s*\{/)[0];
  const defaultConfig = android ? topLevelBlocks(text, /\bdefaultConfig\s*\{/, android)[0] : undefined;

  const scope = defaultConfig ?? android;
  const result: GradleAppModule = {
    isApplication,
    applicationId: scope ? findAssignment(text, ["applicationId"], scope) : undefined,
    namespace: android ? findAssignment(text, ["namespace"], android) : undefined,
    targetSdk: scope ? findAssignment(text, ["targetSdkVersion", "targetSdk"], scope) : undefined,
    minSdk: scope ? findAssignment(text, ["minSdkVersion", "minSdk"], scope) : undefined,
    compileSdk: android ? findAssignment(text, ["compileSdkVersion", "compileSdk"], android) : undefined,
    versionCode: scope ? findAssignment(text, ["versionCode"], scope) : undefined,
    versionName: scope ? findAssignment(text, ["versionName"], scope) : undefined,
    buildTypes: [],
    hasReleaseBuildType: false,
  };

  const buildTypesBlock = android ? topLevelBlocks(text, /\bbuildTypes\s*\{/, android)[0] : undefined;
  if (buildTypesBlock) {
    const header = /(?:^|\n)[ \t]*(?:getByName\(\s*"(\w+)"\s*\)|named\(\s*"(\w+)"\s*\)|create\(\s*"(\w+)"\s*\)|(\w+))\s*\{/;
    const re = new RegExp(header.source, "g");
    const slice = text.slice(buildTypesBlock.bodyStart, buildTypesBlock.bodyEnd);
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice))) {
      const name = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
      const open = buildTypesBlock.bodyStart + m.index + m[0].length - 1;
      const close = matchBrace(text, open);
      if (close < 0) break;
      const block = { bodyStart: open + 1, bodyEnd: close };
      result.buildTypes.push({
        name,
        line: lineAt(text, open),
        signingConfig: findAssignment(text, ["signingConfig"], block),
        debuggable: findAssignment(text, ["debuggable", "isDebuggable"], block),
        minifyEnabled: findAssignment(text, ["minifyEnabled", "isMinifyEnabled"], block),
      });
      re.lastIndex = close - buildTypesBlock.bodyStart;
    }
  }
  result.hasReleaseBuildType = result.buildTypes.some((b) => b.name === "release");
  return result;
}
