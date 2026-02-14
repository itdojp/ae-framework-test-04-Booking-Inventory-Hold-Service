# ae-framework Run Summary

- generatedAt: 2026-02-14T10:12:32.949Z
- runCount: 24
- totalSize: 41 MB (42892682 bytes)
- totalFiles: 7746
- latestRun: 20260214T101232Z-22015548894-1 (runId=22015548894, generatedAt=2026-02-14T10:12:32Z)
- oldestRun: 20260214T002433Z-22007398683-1 (runId=22007398683, generatedAt=2026-02-14T00:24:33Z)

## Workflow Counts

| workflow | count |
| --- | ---: |
| ae-framework-autopilot | 24 |

## Formal Status Counts

| tool | status | count |
| --- | --- | ---: |
| alloy | tool_not_available | 24 |
| csp | tool_not_available | 24 |
| smt | file_not_found | 24 |
| tla | tool_not_available | 24 |

## Project Formal Inputs

- smtInputDir: spec/formal/smt
- smt2Files: 1
- spec/formal/smt/bi-hold-invariants.smt2

## Action Items

- CSP: `CSP_RUN_CMD` または FDR/cspx/cspmchecker の実行環境を設定する。
- TLA+: `TLA_TOOLS_JAR` を設定し TLC 実行可能状態を作る。
- Alloy: `ALLOY_JAR` または Alloy CLI を導入する。
- SMT: `.smt2` は配置済み。`verify:smt` が参照する入力パスを CI で固定する。
- run数が増加しているため、必要に応じて保持期間と圧縮方針を見直す。

## Recent Runs (latest 20)

| runFolder | runId | attempt | generatedAt | size | files | sourceSha | formal(csp/tla) |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| 20260214T101232Z-22015548894-1 | 22015548894 | 1 | 2026-02-14T10:12:32Z | 2.4 MB | 330 | 666c62f716df | csp:tool_not_available, tla:tool_not_available |
| 20260214T100406Z-22015435943-1 | 22015435943 | 1 | 2026-02-14T10:04:06Z | 1.7 MB | 323 | 53d837b72e67 | csp:tool_not_available, tla:tool_not_available |
| 20260214T083717Z-22014307580-1 | 22014307580 | 1 | 2026-02-14T08:37:17Z | 1.7 MB | 323 | ba88da7cd4cd | csp:tool_not_available, tla:tool_not_available |
| 20260214T083126Z-22014233651-1 | 22014233651 | 1 | 2026-02-14T08:31:26Z | 1.7 MB | 323 | b22bcfcbb351 | csp:tool_not_available, tla:tool_not_available |
| 20260214T082439Z-22014149956-1 | 22014149956 | 1 | 2026-02-14T08:24:39Z | 1.7 MB | 323 | 7faaa45ad09b | csp:tool_not_available, tla:tool_not_available |
| 20260214T064030Z-22012828220-1 | 22012828220 | 1 | 2026-02-14T06:40:30Z | 1.7 MB | 323 | f9c7e4e36b5d | csp:tool_not_available, tla:tool_not_available |
| 20260214T063312Z-22012728540-1 | 22012728540 | 1 | 2026-02-14T06:33:12Z | 1.7 MB | 323 | 4d832f13ca29 | csp:tool_not_available, tla:tool_not_available |
| 20260214T062701Z-22012651158-1 | 22012651158 | 1 | 2026-02-14T06:27:01Z | 1.7 MB | 323 | aa480ebcbac8 | csp:tool_not_available, tla:tool_not_available |
| 20260214T061904Z-22012541560-1 | 22012541560 | 1 | 2026-02-14T06:19:05Z | 1.7 MB | 323 | ebc399c66784 | csp:tool_not_available, tla:tool_not_available |
| 20260214T061045Z-22012433897-1 | 22012433897 | 1 | 2026-02-14T06:10:45Z | 1.7 MB | 323 | d8095a14c5e3 | csp:tool_not_available, tla:tool_not_available |
| 20260214T060456Z-22012361132-1 | 22012361132 | 1 | 2026-02-14T06:04:56Z | 1.7 MB | 323 | 791f52b707f7 | csp:tool_not_available, tla:tool_not_available |
| 20260214T055453Z-22012231795-1 | 22012231795 | 1 | 2026-02-14T05:54:53Z | 1.7 MB | 323 | c35bdca23eb2 | csp:tool_not_available, tla:tool_not_available |
| 20260214T054835Z-22012151467-1 | 22012151467 | 1 | 2026-02-14T05:48:36Z | 1.7 MB | 323 | a13cfdac9825 | csp:tool_not_available, tla:tool_not_available |
| 20260214T053832Z-22012026276-1 | 22012026276 | 1 | 2026-02-14T05:38:33Z | 1.7 MB | 323 | 52bf0a6386c7 | csp:tool_not_available, tla:tool_not_available |
| 20260214T053256Z-22011955122-1 | 22011955122 | 1 | 2026-02-14T05:32:56Z | 1.7 MB | 323 | f6a9164c7b01 | csp:tool_not_available, tla:tool_not_available |
| 20260214T043226Z-22011155921-1 | 22011155921 | 1 | 2026-02-14T04:32:26Z | 1.7 MB | 323 | 19b00cccad4f | csp:tool_not_available, tla:tool_not_available |
| 20260214T042542Z-22011062750-1 | 22011062750 | 1 | 2026-02-14T04:25:42Z | 1.7 MB | 323 | 2b1139445666 | csp:tool_not_available, tla:tool_not_available |
| 20260214T041556Z-22010926475-1 | 22010926475 | 1 | 2026-02-14T04:15:57Z | 1.7 MB | 323 | eff3e451996b | csp:tool_not_available, tla:tool_not_available |
| 20260214T040705Z-22010802515-1 | 22010802515 | 1 | 2026-02-14T04:07:06Z | 1.7 MB | 323 | 055b27a40ea2 | csp:tool_not_available, tla:tool_not_available |
| 20260214T005712Z-22008008403-1 | 22008008403 | 1 | 2026-02-14T00:57:12Z | 1.7 MB | 323 | 8e35bdab9b67 | csp:tool_not_available, tla:tool_not_available |
