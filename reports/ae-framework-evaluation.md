# ae-framework Evaluation Report

- generatedAt: 2026-02-14T10:07:38.653Z
- score: 50 / 100
- rating: C
- runCount: 23
- totalArtifactSizeMB: 38.5
- autopilotRuns: 23

## Snapshot

- latestRunId: 22015435943
- latestRunGeneratedAt: 2026-02-14T10:04:06Z
- latestSource: itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service@53d837b72e67ab405b0606a9f227f1ea802c2936
- latestArtifactPath: artifacts/runs/20260214T100406Z-22015435943-1

## Formal Readiness

- readyTools: 0 / 4
- projectSmtInputs: 1
- csp: tool_not_available
- tla: tool_not_available
- smt: file_not_found
- alloy: tool_not_available

## Recommended Actions

- CSP: `CSP_RUN_CMD` または FDR/cspx/cspmchecker の実行環境を設定する。
- TLA+: `TLA_TOOLS_JAR` を設定し TLC 実行可能状態を作る。
- Alloy: `ALLOY_JAR` または Alloy CLI を導入する。
- SMT: `.smt2` は配置済み。`verify:smt` が参照する入力パスを CI で固定する。
- run数が増加しているため、必要に応じて保持期間と圧縮方針を見直す。
