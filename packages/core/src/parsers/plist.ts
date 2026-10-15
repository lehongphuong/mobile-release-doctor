import { XMLParser } from "fast-xml-parser";

export type PlistValue = string | number | boolean | Date | PlistValue[] | { [key: string]: PlistValue } | null;
export type PlistDict = { [key: string]: PlistValue };

type OrderedNode = Record<string, unknown> & { ":@"?: Record<string, string> };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
});

export class PlistParseError extends Error {}

/** Parse an XML property list. Binary plists are rejected with a clear error. */
export function parsePlist(text: string): PlistValue {
  if (text.startsWith("bplist")) throw new PlistParseError("binary plist is not supported; convert with `plutil -convert xml1`");
  let doc: OrderedNode[];
  try {
    doc = parser.parse(text) as OrderedNode[];
  } catch (e) {
    throw new PlistParseError(`invalid XML: ${(e as Error).message}`);
  }
  const plist = doc.find((n) => "plist" in n);
  if (!plist) throw new PlistParseError("missing <plist> root element");
  const children = (plist["plist"] as OrderedNode[]).filter((n) => !("#text" in n));
  if (children.length !== 1) throw new PlistParseError("<plist> must contain exactly one value");
  return convert(children[0]!);
}

function textOf(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  return nodes.map((n) => String((n as OrderedNode)["#text"] ?? "")).join("");
}

function convert(node: OrderedNode): PlistValue {
  const tag = Object.keys(node).find((k) => k !== ":@");
  if (!tag) throw new PlistParseError("empty node");
  const content = node[tag];
  switch (tag) {
    case "string":
      return textOf(content);
    case "integer":
    case "real": {
      const raw = textOf(content).trim();
      const n = Number(raw);
      if (Number.isNaN(n)) throw new PlistParseError(`invalid number "${raw}"`);
      return n;
    }
    case "true":
      return true;
    case "false":
      return false;
    case "date":
      return new Date(textOf(content).trim());
    case "data":
      return textOf(content).replace(/\s+/g, "");
    case "array":
      return (content as OrderedNode[]).filter((n) => !("#text" in n)).map(convert);
    case "dict": {
      const out: PlistDict = {};
      const items = (content as OrderedNode[]).filter((n) => !("#text" in n));
      for (let i = 0; i < items.length; i += 2) {
        const keyNode = items[i]!;
        if (!("key" in keyNode)) throw new PlistParseError("expected <key> inside <dict>");
        const valueNode = items[i + 1];
        if (!valueNode) throw new PlistParseError(`key "${textOf(keyNode["key"])}" has no value`);
        out[textOf(keyNode["key"])] = convert(valueNode);
      }
      return out;
    }
    default:
      throw new PlistParseError(`unsupported plist element <${tag}>`);
  }
}

export function isDict(v: PlistValue | undefined): v is PlistDict {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}
