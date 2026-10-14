# Running in CI

The scanner is a single file with no dependencies. Pin a release tag so
results only change when you upgrade.

```yaml
# .github/workflows/release-doctor.yml (in your app repository)
name: Release Doctor
on: [pull_request]
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Fetch Mobile Release Doctor
        run: git clone --depth 1 --branch v0.1.0 https://github.com/lehongphuong/mobile-release-doctor "$RUNNER_TEMP/mrd"
      - name: Scan
        run: |
          node "$RUNNER_TEMP/mrd/skills/mobile-release-doctor/scripts/scan.mjs" \
            --project . --strict --fail-on high \
            --format markdown --output release-doctor.md \
            --json-output release-doctor.json
      - name: Job summary
        if: always()
        run: cat release-doctor.md >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: release-doctor-report
          path: release-doctor.*
```

- `--strict --fail-on high` fails the job (exit 1) only for `fail`/`warn`
  findings of severity high or error. `needs_review` items never fail CI;
  they are listed in the summary.
- Exit 2 (config/input) and 3 (scanner error) also fail the job — they mean
  the scan did not complete as configured.
- Accept known risks in `.release-doctor.yml` under `ignore` with a reason
  instead of loosening the threshold.
- For a monorepo, run one step per app with `--project apps/<name>`.
