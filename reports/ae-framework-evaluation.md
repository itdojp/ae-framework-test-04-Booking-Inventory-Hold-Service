# ae-framework Evaluation Report

- generatedAt: 2026-02-14T10:12:32.981Z
- score: 50 / 100
- rating: C
- runCount: 24
- totalArtifactSizeMB: 40.9
- autopilotRuns: 24

## Snapshot

- latestRunId: 22015548894
- latestRunGeneratedAt: 2026-02-14T10:12:32Z
- latestSource: itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service@666c62f716df8a78e726e7b5c7c8b755ff262cc3
- latestArtifactPath: artifacts/runs/20260214T101232Z-22015548894-1

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
