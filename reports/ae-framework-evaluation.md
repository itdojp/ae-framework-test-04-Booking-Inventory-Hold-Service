# ae-framework Evaluation Report

- generatedAt: 2026-02-14T10:19:32.708Z
- score: 50 / 100
- rating: C
- runCount: 25
- totalArtifactSizeMB: 42.6
- autopilotRuns: 25

## Snapshot

- latestRunId: 22015647906
- latestRunGeneratedAt: 2026-02-14T10:19:32Z
- latestSource: itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service@c18860e3a7946110d11fbab26641d69e76cccdc2
- latestArtifactPath: artifacts/runs/20260214T101932Z-22015647906-1

## Formal Readiness

- readyTools: 0 / 4
- projectSmtInputs: 1
- csp: tool_not_available
- tla: tool_not_available
- smt: solver_not_available
- alloy: tool_not_available

## Recommended Actions

- CSP: `CSP_RUN_CMD` または FDR/cspx/cspmchecker の実行環境を設定する。
- TLA+: `TLA_TOOLS_JAR` を設定し TLC 実行可能状態を作る。
- Alloy: `ALLOY_JAR` または Alloy CLI を導入する。
- SMT: z3 または cvc5 を実行環境へ導入する。
- run数が増加しているため、必要に応じて保持期間と圧縮方針を見直す。
