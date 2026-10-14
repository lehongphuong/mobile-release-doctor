/** 1-based line number of the first occurrence of `needle`, or undefined. */
export function lineOf(text: string, needle: string | RegExp, from = 0): number | undefined {
  let index: number;
  if (typeof needle === "string") {
    index = text.indexOf(needle, from);
  } else {
    const re = new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : needle.flags + "g");
    re.lastIndex = from;
    const m = re.exec(text);
    index = m ? m.index : -1;
  }
  if (index < 0) return undefined;
  return lineAt(text, index);
}

export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Strip // and /* *\/ comments from C-like source while keeping line structure. */
export function stripCLikeComments(src: string): string {
  let out = "";
  let i = 0;
  let inString: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (inString) {
      out += c;
      if (c === "\\" && n !== undefined) {
        out += n;
        i += 2;
        continue;
      }
      if (c === inString || c === "\n") inString = null;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") inString = c;
    out += c;
    i++;
  }
  return out;
}
