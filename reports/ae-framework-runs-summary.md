# ae-framework Run Summary

- generatedAt: 2026-02-16T18:15:50.941Z
- runCount: 39
- totalSize: 66 MB (69355446 bytes)
- totalFiles: 12644
- latestRun: 20260216T181550Z-22073334349-1 (runId=22073334349, generatedAt=2026-02-16T18:15:50Z)
- oldestRun: 20260214T002433Z-22007398683-1 (runId=22007398683, generatedAt=2026-02-14T00:24:33Z)

## Workflow Counts

| workflow | count |
| --- | ---: |
| ae-framework-autopilot | 39 |

## Formal Status Counts

| tool | status | count |
| --- | --- | ---: |
| alloy | tool_not_available | 27 |
| alloy | ran | 12 |
| csp | tool_not_available | 29 |
| csp | ran | 10 |
| smt | file_not_found | 24 |
| smt | ran | 13 |
| smt | solver_not_available | 2 |
| tla | tool_not_available | 27 |
| tla | ran | 11 |
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
- reviewOverdue: no

## Action Items

- 現時点で優先アクションはありません。

## Recent Runs (latest 20)

| runFolder | runId | attempt | generatedAt | size | files | sourceSha | formal(csp/tla) |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| 20260216T181550Z-22073334349-1 | 22073334349 | 1 | 2026-02-16T18:15:50Z | 2.4 MB | 334 | e26f20bf151e | csp:ran, tla:ran |
| 20260216T063856Z-22052617410-1 | 22052617410 | 1 | 2026-02-16T06:38:57Z | 1.7 MB | 327 | 0780d22075a4 | csp:ran, tla:ran |
| 20260216T030656Z-22048655727-1 | 22048655727 | 1 | 2026-02-16T03:06:56Z | 1.7 MB | 327 | 79ff1e10543a | csp:ran, tla:ran |
| 20260215T234235Z-22045249968-1 | 22045249968 | 1 | 2026-02-15T23:42:36Z | 1.7 MB | 327 | b65de181ace9 | csp:ran, tla:ran |
| 20260215T181042Z-22040509428-1 | 22040509428 | 1 | 2026-02-15T18:10:42Z | 1.7 MB | 327 | 7be998ee4ea2 | csp:ran, tla:ran |
| 20260215T130146Z-22036057419-1 | 22036057419 | 1 | 2026-02-15T13:01:46Z | 1.7 MB | 327 | f52f5f94766c | csp:ran, tla:ran |
| 20260215T084006Z-22032606462-1 | 22032606462 | 1 | 2026-02-15T08:40:06Z | 1.7 MB | 327 | 3ac9d72ffe08 | csp:ran, tla:ran |
| 20260214T181004Z-22021904791-1 | 22021904791 | 1 | 2026-02-14T18:10:04Z | 1.7 MB | 327 | 6d9add73888d | csp:ran, tla:ran |
| 20260214T152806Z-22019776127-1 | 22019776127 | 1 | 2026-02-14T15:28:06Z | 1.7 MB | 327 | 3addc2f23502 | csp:ran, tla:ran |
| 20260214T111508Z-22016333611-1 | 22016333611 | 1 | 2026-02-14T11:15:08Z | 1.7 MB | 327 | 92d9b29b47ab | csp:ran, tla:ran |
| 20260214T110745Z-22016244105-1 | 22016244105 | 1 | 2026-02-14T11:07:45Z | 1.7 MB | 326 | 6787ed20d80d | csp:tool_not_available, tla:ran |
| 20260214T105937Z-22016137118-1 | 22016137118 | 1 | 2026-02-14T10:59:37Z | 1.7 MB | 326 | fe74b5e5cf55 | csp:tool_not_available, tla:failed |
| 20260214T105224Z-22016056764-1 | 22016056764 | 1 | 2026-02-14T10:52:24Z | 1.7 MB | 325 | a5a9f62f87a9 | csp:tool_not_available, tla:tool_not_available |
| 20260214T102543Z-22015732416-1 | 22015732416 | 1 | 2026-02-14T10:25:44Z | 1.7 MB | 325 | 57a43f98b3ba | csp:tool_not_available, tla:tool_not_available |
| 20260214T101932Z-22015647906-1 | 22015647906 | 1 | 2026-02-14T10:19:32Z | 1.7 MB | 325 | c18860e3a794 | csp:tool_not_available, tla:tool_not_available |
| 20260214T101232Z-22015548894-1 | 22015548894 | 1 | 2026-02-14T10:12:32Z | 1.7 MB | 324 | 666c62f716df | csp:tool_not_available, tla:tool_not_available |
| 20260214T100406Z-22015435943-1 | 22015435943 | 1 | 2026-02-14T10:04:06Z | 1.7 MB | 323 | 53d837b72e67 | csp:tool_not_available, tla:tool_not_available |
| 20260214T083717Z-22014307580-1 | 22014307580 | 1 | 2026-02-14T08:37:17Z | 1.7 MB | 323 | ba88da7cd4cd | csp:tool_not_available, tla:tool_not_available |
| 20260214T083126Z-22014233651-1 | 22014233651 | 1 | 2026-02-14T08:31:26Z | 1.7 MB | 323 | b22bcfcbb351 | csp:tool_not_available, tla:tool_not_available |
| 20260214T082439Z-22014149956-1 | 22014149956 | 1 | 2026-02-14T08:24:39Z | 1.7 MB | 323 | 7faaa45ad09b | csp:tool_not_available, tla:tool_not_available |
