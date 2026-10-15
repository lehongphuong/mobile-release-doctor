// Bundles the scanner into a single dependency-free file that the Claude Code
// skill runs directly with `node`. The bundle is committed so installing the
// plugin never requires `npm install`. `--check` fails if it is out of date.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const outfile = "skills/mobile-release-doctor/scripts/scan.mjs";
const check = process.argv.includes("--check");

const result = await build({
  entryPoints: ["packages/core/src/cli/bin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  legalComments: "eof",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "// GENERATED FILE — do not edit. Source: packages/core/src. Rebuild with `npm run build`.",
      "import { createRequire as __mrdCreateRequire } from 'node:module';",
      "const require = __mrdCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
const code = result.outputFiles[0].text;

if (check) {
  let current = "";
  try {
    current = readFileSync(outfile, "utf8");
  } catch {}
  if (current !== code) {
    console.error(`${outfile} is out of date. Run \`npm run build\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${outfile} is up to date.`);
} else {
  writeFileSync(outfile, code, { mode: 0o755 });
  console.log(`Wrote ${outfile} (${(code.length / 1024).toFixed(0)} KiB)`);
}
