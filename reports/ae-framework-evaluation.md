# ae-framework Evaluation Report

- generatedAt: 2026-02-14T10:25:44.433Z
- score: 50 / 100
- rating: C
- runCount: 26
- totalArtifactSizeMB: 44.3
- autopilotRuns: 26

## Snapshot

- latestRunId: 22015732416
- latestRunGeneratedAt: 2026-02-14T10:25:44Z
- latestSource: itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service@57a43f98b3bade8fe85d2b907d793cdfbbb17d8b
- latestArtifactPath: artifacts/runs/20260214T102543Z-22015732416-1

## Formal Readiness

- readyTools: 0 / 4
- projectSmtInputs: 1
- csp: tool_not_available
- tla: tool_not_available
- smt: solver_not_available
- alloy: tool_not_available

## Formal Delta

- csp: tool_not_available -> tool_not_available (same)
- tla: tool_not_available -> tool_not_available (same)
- smt: solver_not_available -> solver_not_available (same)
- alloy: tool_not_available -> tool_not_available (same)

## Recommended Actions

- CSP: `CSP_RUN_CMD` または FDR/cspx/cspmchecker の実行環境を設定する。
- TLA+: `TLA_TOOLS_JAR` を設定し TLC 実行可能状態を作る。
- Alloy: `ALLOY_JAR` または Alloy CLI を導入する。
- SMT: z3 または cvc5 を実行環境へ導入する。
- run数が増加しているため、必要に応じて保持期間と圧縮方針を見直す。
