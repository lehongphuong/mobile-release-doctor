import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface ManifestPermission {
  name: string;
  maxSdkVersion?: number;
  /** tools:node="remove" means the permission is stripped during manifest merge. */
  removed: boolean;
}

export interface AndroidManifest {
  packageAttr?: string;
  permissions: ManifestPermission[];
  application?: Record<string, string>;
  usesSdk?: { minSdkVersion?: string; targetSdkVersion?: string };
  /** Activities, services, receivers and providers with their attributes. */
  components: { type: string; attrs: Record<string, string> }[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  isArray: (name) =>
    ["uses-permission", "uses-permission-sdk-23", "activity", "service", "receiver", "provider", "activity-alias"].includes(
      name,
    ),
});

export class ManifestParseError extends Error {}

function attrs(node: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function parseAndroidManifest(text: string): AndroidManifest {
  const valid = XMLValidator.validate(text);
  if (valid !== true) throw new ManifestParseError(`invalid XML at line ${valid.err.line}: ${valid.err.msg}`);
  const doc = parser.parse(text) as Record<string, unknown>;
  if (!("manifest" in doc)) throw new ManifestParseError("missing <manifest> root element");
  // An empty <manifest/> (common in library modules) parses as a string.
  const manifest = (typeof doc["manifest"] === "object" && doc["manifest"] ? doc["manifest"] : {}) as Record<string, unknown>;

  const permissions: ManifestPermission[] = [];
  for (const tag of ["uses-permission", "uses-permission-sdk-23"]) {
    for (const p of (manifest[tag] as unknown[]) ?? []) {
      const a = attrs(p);
      const name = a["android:name"];
      if (!name) continue;
      const max = a["android:maxSdkVersion"];
      permissions.push({
        name,
        maxSdkVersion: max !== undefined && /^\d+$/.test(max) ? Number(max) : undefined,
        removed: a["tools:node"] === "remove",
      });
    }
  }

  const appNode = manifest["application"];
  const application = appNode && typeof appNode === "object" ? attrs(appNode) : undefined;
  const components: AndroidManifest["components"] = [];
  if (appNode && typeof appNode === "object") {
    for (const type of ["activity", "activity-alias", "service", "receiver", "provider"]) {
      for (const c of ((appNode as Record<string, unknown>)[type] as unknown[]) ?? []) components.push({ type, attrs: attrs(c) });
    }
  }
  const usesSdkNode = manifest["uses-sdk"];
  const usesSdk = usesSdkNode
    ? {
        minSdkVersion: attrs(usesSdkNode)["android:minSdkVersion"],
        targetSdkVersion: attrs(usesSdkNode)["android:targetSdkVersion"],
      }
    : undefined;

  return { packageAttr: attrs(manifest)["package"], permissions, application, usesSdk, components };
}
