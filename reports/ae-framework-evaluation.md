# ae-framework Evaluation Report

- generatedAt: 2026-02-14T10:52:24.890Z
- score: 63 / 100
- rating: C
- runCount: 27
- totalArtifactSizeMB: 45.9
- autopilotRuns: 27

## Snapshot

- latestRunId: 22016056764
- latestRunGeneratedAt: 2026-02-14T10:52:24Z
- latestSource: itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service@a5a9f62f87a9813e9b7fca504308b1d95a6eacd1
- latestArtifactPath: artifacts/runs/20260214T105224Z-22016056764-1

## Formal Readiness

- readyTools: 1 / 4
- projectSmtInputs: 1
- csp: tool_not_available
- tla: tool_not_available
- smt: ran
- alloy: tool_not_available

## Formal Delta

- csp: tool_not_available -> tool_not_available (same)
- tla: tool_not_available -> tool_not_available (same)
- smt: solver_not_available -> ran (changed)
- alloy: tool_not_available -> tool_not_available (same)

## Recommended Actions

- CSP: `CSP_RUN_CMD` または FDR/cspx/cspmchecker の実行環境を設定する。
- TLA+: `TLA_TOOLS_JAR` を設定し TLC 実行可能状態を作る。
- Alloy: `ALLOY_JAR` または Alloy CLI を導入する。
- run数が増加しているため、必要に応じて保持期間と圧縮方針を見直す。
