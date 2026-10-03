# Contributing

Issues and pull requests are welcome. Explain the observed problem, expected behavior and a reproducible example. UI changes should include desktop/mobile screenshots; data changes should include a small anonymized fixture and source-field explanation.

## Local checks

Use Node 24 and run:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Keep the demo points clearly marked. Do not commit real project exports, proprietary fonts, credentials, local runtime state or a personal Site binding. Third-party assets must include their applicable license and attribution.

Preserve these contracts:

- Missing, old or failed readings must not become an all-clear.
- Water statuses 1/2 are low water; 4 is high water and 5 is overbank.
- Station MSL elevation is not flood depth inside a project.
- Proximity is not proof of hydrological connectivity.
- Keep the triggering station, distance and observation time visible.
- Honor reduced motion and keep a usable project list if WebGL is unavailable.

Contributions are made under the repository's MIT license, excluding third-party material with its own license. Report security issues through the private channel in SECURITY.md.
