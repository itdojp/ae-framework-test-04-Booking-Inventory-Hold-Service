# ae-framework Run Summary

- generatedAt: 2026-05-18T18:42:32.301Z
- runCount: 125
- totalSize: 212 MB (222075193 bytes)
- totalFiles: 41199
- latestRun: 20260518T184231Z-26052866540-1 (runId=26052866540, generatedAt=2026-05-18T18:42:31Z)
- oldestRun: 20260214T002433Z-22007398683-1 (runId=22007398683, generatedAt=2026-02-14T00:24:33Z)

## Workflow Counts

| workflow | count |
| --- | ---: |
| ae-framework-autopilot | 125 |

## Formal Status Counts

| tool | status | count |
| --- | --- | ---: |
| alloy | ran | 98 |
| alloy | tool_not_available | 27 |
| csp | ran | 96 |
| csp | tool_not_available | 29 |
| smt | ran | 99 |
| smt | file_not_found | 24 |
| smt | solver_not_available | 2 |
| tla | ran | 97 |
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
| 20260518T184231Z-26052866540-1 | 26052866540 | 1 | 2026-05-18T18:42:31Z | 2.6 MB | 339 | cc3cc44783dd | csp:ran, tla:ran |
| 20260517T182839Z-25998949720-1 | 25998949720 | 1 | 2026-05-17T18:28:39Z | 1.7 MB | 333 | ac46f59e06ab | csp:ran, tla:ran |
| 20260516T182520Z-25969348744-1 | 25969348744 | 1 | 2026-05-16T18:25:20Z | 1.7 MB | 333 | fc02232822ef | csp:ran, tla:ran |
| 20260515T183904Z-25934697029-1 | 25934697029 | 1 | 2026-05-15T18:39:05Z | 1.7 MB | 333 | abde4819bfbf | csp:ran, tla:ran |
| 20260514T184304Z-25878273173-1 | 25878273173 | 1 | 2026-05-14T18:43:05Z | 1.7 MB | 333 | 9b5c6a1abc45 | csp:ran, tla:ran |
| 20260513T184454Z-25818936844-1 | 25818936844 | 1 | 2026-05-13T18:44:54Z | 1.7 MB | 333 | 4561607b22fa | csp:ran, tla:ran |
| 20260512T184551Z-25754687624-1 | 25754687624 | 1 | 2026-05-12T18:45:51Z | 1.7 MB | 333 | 8f6f05627e37 | csp:ran, tla:ran |
| 20260511T184044Z-25689730450-1 | 25689730450 | 1 | 2026-05-11T18:40:44Z | 1.7 MB | 324 | 5274dbf135a8 | csp:ran, tla:ran |
| 20260510T182544Z-25636187754-1 | 25636187754 | 1 | 2026-05-10T18:25:44Z | 1.7 MB | 333 | 13a0c40339c9 | csp:ran, tla:ran |
| 20260509T182545Z-25608391706-1 | 25608391706 | 1 | 2026-05-09T18:25:45Z | 1.7 MB | 333 | bf04ff777bb5 | csp:ran, tla:ran |
| 20260508T183525Z-25572483695-1 | 25572483695 | 1 | 2026-05-08T18:35:25Z | 1.7 MB | 333 | f8e66041cf56 | csp:ran, tla:ran |
| 20260507T184007Z-25514746500-1 | 25514746500 | 1 | 2026-05-07T18:40:08Z | 1.7 MB | 333 | e5e00c18112c | csp:ran, tla:ran |
| 20260506T183915Z-25453779496-1 | 25453779496 | 1 | 2026-05-06T18:39:15Z | 1.7 MB | 333 | 179c2dbe0a58 | csp:ran, tla:ran |
| 20260505T183545Z-25394753144-1 | 25394753144 | 1 | 2026-05-05T18:35:46Z | 1.7 MB | 333 | e0bff537fe77 | csp:ran, tla:ran |
| 20260504T183757Z-25336214854-1 | 25336214854 | 1 | 2026-05-04T18:37:57Z | 1.7 MB | 333 | 7b50356b79fc | csp:ran, tla:ran |
| 20260503T182404Z-25286960666-1 | 25286960666 | 1 | 2026-05-03T18:24:05Z | 1.7 MB | 333 | 8a3caf07ff60 | csp:ran, tla:ran |
| 20260502T182335Z-25258601328-1 | 25258601328 | 1 | 2026-05-02T18:23:35Z | 1.7 MB | 333 | e3c1cbddbe2b | csp:ran, tla:ran |
| 20260501T182837Z-25226965606-1 | 25226965606 | 1 | 2026-05-01T18:28:38Z | 1.7 MB | 333 | 766ab974c84b | csp:ran, tla:ran |
| 20260430T183511Z-25182437061-1 | 25182437061 | 1 | 2026-04-30T18:35:11Z | 1.7 MB | 333 | 695c9e2488eb | csp:ran, tla:ran |
| 20260429T183600Z-25126701753-1 | 25126701753 | 1 | 2026-04-29T18:36:01Z | 1.7 MB | 333 | 0242205a013b | csp:ran, tla:ran |
