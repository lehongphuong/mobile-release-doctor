import { lstatSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

export const DEFAULT_EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "build",
  ".dart_tool",
  ".pub-cache",
  ".symlinks",
  "Pods",
  ".gradle",
  ".idea",
  ".vscode",
  ".cxx",
  ".externalNativeBuild",
  "DerivedData",
  ".expo",
  ".next",
  "dist",
  "coverage",
  ".release-doctor",
  "ephemeral",
  ".fvm",
]);

export interface WalkResult {
  files: string[];
  truncated: boolean;
}

/** Convert a simple glob (`*`, `**`, `?`) into a RegExp matched against posix relative paths. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // A pattern without glob characters matches the path itself or anything below it.
  if (!/[*?]/.test(glob)) return new RegExp(`^${re.replace(/\/$/, "")}(?:/.*)?$`);
  return new RegExp(`^${re}$`);
}

export function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

/**
 * List project files as posix-style relative paths. Never follows symlinks,
 * so a scan cannot escape the project directory.
 */
export function walkProject(root: string, excludes: string[] = [], maxFiles = 60000): WalkResult {
  const excludeRes = excludes.map(globToRegExp);
  const files: string[] = [];
  let truncated = false;
  const stack: string[] = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(join(root, rel));
    } catch {
      continue;
    }
    entries.sort();
    for (const name of entries) {
      const childRel = rel ? `${rel}/${name}` : name;
      if (excludeRes.some((r) => r.test(childRel))) continue;
      let st;
      try {
        st = lstatSync(join(root, childRel));
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (DEFAULT_EXCLUDED_DIRS.has(name)) continue;
        if (name.endsWith(".xcassets") || name.endsWith(".imageset")) continue;
        stack.push(childRel);
      } else if (st.isFile()) {
        if (files.length >= maxFiles) {
          truncated = true;
          return { files: files.sort(), truncated };
        }
        files.push(childRel);
      }
    }
  }
  return { files: files.sort(), truncated };
}
