# Security policy

Mobile Release Doctor runs inside developers' repositories, so its safety
properties are part of the product:

- **Read-only.** A scan never writes to the project (tested in CI). The only
  files written are reports at paths you pass with `--output`.
- **Offline.** The scanner makes no network requests. Only the maintainer
  tool `validate-policy-sources.mjs` fetches the official policy URLs, and it
  sends no project data.
- **No code execution.** It parses files; it never runs Gradle, Xcode,
  Flutter, npm scripts, `app.config.js` or other project code. The only
  external process is `git ls-files` (disable with `--no-git`).
- **Secret redaction.** Secret-like values are masked (prefix + length) in
  evidence and in every report format.
- **No symlink traversal.** The file walker does not follow symlinks.

## Reporting a vulnerability

Please report privately via
[GitHub security advisories](https://github.com/lehongphuong/mobile-release-doctor/security/advisories/new).
Include the version, a minimal reproduction and the impact. Expect an
acknowledgement within 7 days.

Examples of in-scope issues: a scan that modifies files, leaks a secret
value into a report, follows paths outside the project, or executes project
code.
