# ae-framework Evaluation Report

- generatedAt: 2026-02-14T09:59:11.051Z
- score: 50 / 100
- rating: C
- runCount: 22
- totalArtifactSizeMB: 36.8
- autopilotRuns: 22

## Snapshot

- latestRunId: 22014307580
- latestRunGeneratedAt: 2026-02-14T08:37:17Z
- latestSource: itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service@ba88da7cd4cd17b1d65b34b393d098f8f6323db8
- latestArtifactPath: artifacts/runs/20260214T083717Z-22014307580-1

## Formal Readiness

- readyTools: 0 / 4
- csp: tool_not_available
- tla: tool_not_available
- smt: file_not_found
- alloy: tool_not_available

## Recommended Actions

- CSP: `CSP_RUN_CMD` または FDR/cspx/cspmchecker の実行環境を設定する。
- TLA+: `TLA_TOOLS_JAR` を設定し TLC 実行可能状態を作る。
- Alloy: `ALLOY_JAR` または Alloy CLI を導入する。
- SMT: 検証対象 `.smt2` ファイルを配置し `verify:smt` 入力を固定する。
- run数が増加しているため、必要に応じて保持期間と圧縮方針を見直す。
