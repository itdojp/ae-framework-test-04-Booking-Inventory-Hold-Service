# ae-framework Run Summary

- generatedAt: 2026-04-02T18:22:57.168Z
- runCount: 81
- totalSize: 137 MB (143936922 bytes)
- totalFiles: 26556
- latestRun: 20260402T182256Z-23915210346-1 (runId=23915210346, generatedAt=2026-04-02T18:22:56Z)
- oldestRun: 20260214T002433Z-22007398683-1 (runId=22007398683, generatedAt=2026-02-14T00:24:33Z)

## Workflow Counts

| workflow | count |
| --- | ---: |
| ae-framework-autopilot | 81 |

## Formal Status Counts

| tool | status | count |
| --- | --- | ---: |
| alloy | ran | 54 |
| alloy | tool_not_available | 27 |
| csp | ran | 52 |
| csp | tool_not_available | 29 |
| smt | ran | 55 |
| smt | file_not_found | 24 |
| smt | solver_not_available | 2 |
| tla | ran | 53 |
| tla | tool_not_available | 27 |
| tla | failed | 1 |

## Formal Status Delta (latest vs previous)

| tool | previous | latest | changed |
| --- | --- | --- | --- |
| csp | ran | ran | no |
| tla | ran | ran | no |
| smt | ran | ran | no |
| alloy | ran | ran | no |

## Project Formal Inputs

- smtInputDir: spec/formal/smt
- smt2Files: 1
- spec/formal/smt/bi-hold-invariants.smt2

## Artifact Retention Policy

- policyPath: configs/artifact-retention/policy.json
- configured: yes
- valid: yes
- mode: keep_all_on_github
- preserveAllArtifacts: true
- lastReviewedAt: 2026-02-14
- reviewMaxAgeDays: 30
- reviewOverdue: yes

## Action Items

- artifact retention policy のレビュー期限を超過しています。`lastReviewedAt` を更新する。

## Recent Runs (latest 20)

| runFolder | runId | attempt | generatedAt | size | files | sourceSha | formal(csp/tla) |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| 20260402T182256Z-23915210346-1 | 23915210346 | 1 | 2026-04-02T18:22:56Z | 2.6 MB | 339 | 1a7b79c803e5 | csp:ran, tla:ran |
| 20260401T182357Z-23863897597-1 | 23863897597 | 1 | 2026-04-01T18:23:57Z | 1.7 MB | 333 | 36b66a579fb8 | csp:ran, tla:ran |
| 20260331T182417Z-23812800290-1 | 23812800290 | 1 | 2026-03-31T18:24:17Z | 1.7 MB | 333 | 66203f288f62 | csp:ran, tla:ran |
| 20260330T182440Z-23760530787-1 | 23760530787 | 1 | 2026-03-30T18:24:40Z | 1.7 MB | 333 | f20fedbcca92 | csp:ran, tla:ran |
| 20260328T181336Z-23691177010-1 | 23691177010 | 1 | 2026-03-28T18:13:36Z | 1.7 MB | 333 | 889df42ca82a | csp:ran, tla:ran |
| 20260327T182359Z-23661074341-1 | 23661074341 | 1 | 2026-03-27T18:24:00Z | 1.7 MB | 333 | 0d067080e752 | csp:ran, tla:ran |
| 20260326T182652Z-23610981853-1 | 23610981853 | 1 | 2026-03-26T18:26:52Z | 1.7 MB | 333 | cbf9d779b511 | csp:ran, tla:ran |
| 20260325T182538Z-23557018250-1 | 23557018250 | 1 | 2026-03-25T18:25:38Z | 1.7 MB | 333 | c25ae39324cb | csp:ran, tla:ran |
| 20260324T182459Z-23505471790-1 | 23505471790 | 1 | 2026-03-24T18:24:59Z | 1.7 MB | 333 | 47a2a6731f69 | csp:ran, tla:ran |
| 20260323T182236Z-23453083863-1 | 23453083863 | 1 | 2026-03-23T18:22:36Z | 1.7 MB | 333 | 572148e6939e | csp:ran, tla:ran |
| 20260322T181318Z-23409190121-1 | 23409190121 | 1 | 2026-03-22T18:13:18Z | 1.7 MB | 333 | a463a917602a | csp:ran, tla:ran |
| 20260321T181301Z-23385537711-1 | 23385537711 | 1 | 2026-03-21T18:13:02Z | 1.7 MB | 333 | 92497e6f34f9 | csp:ran, tla:ran |
| 20260320T181801Z-23356417851-1 | 23356417851 | 1 | 2026-03-20T18:18:01Z | 1.7 MB | 333 | d7db4ce093cf | csp:ran, tla:ran |
| 20260319T182322Z-23310092348-1 | 23310092348 | 1 | 2026-03-19T18:23:22Z | 1.7 MB | 333 | 2c65445acbf7 | csp:ran, tla:ran |
| 20260318T182657Z-23260277326-1 | 23260277326 | 1 | 2026-03-18T18:26:57Z | 1.7 MB | 333 | 8e128caf55c1 | csp:ran, tla:ran |
| 20260317T182459Z-23209716278-1 | 23209716278 | 1 | 2026-03-17T18:24:59Z | 1.7 MB | 333 | e205fb9c14b6 | csp:ran, tla:ran |
| 20260316T182549Z-23159245656-1 | 23159245656 | 1 | 2026-03-16T18:25:50Z | 1.7 MB | 333 | 90c099a61fbf | csp:ran, tla:ran |
| 20260315T181344Z-23116183598-1 | 23116183598 | 1 | 2026-03-15T18:13:44Z | 1.7 MB | 333 | 13d6568327b3 | csp:ran, tla:ran |
| 20260314T181320Z-23093414114-1 | 23093414114 | 1 | 2026-03-14T18:13:21Z | 1.7 MB | 333 | 4dcf97542b58 | csp:ran, tla:ran |
| 20260313T181705Z-23064324038-1 | 23064324038 | 1 | 2026-03-13T18:17:05Z | 1.7 MB | 333 | 101c1aa8a1ef | csp:ran, tla:ran |
