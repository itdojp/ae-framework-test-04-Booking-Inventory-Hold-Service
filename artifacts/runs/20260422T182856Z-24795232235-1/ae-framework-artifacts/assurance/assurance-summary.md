# Assurance Summary

- generatedAt: 2026-04-22T18:26:10.225Z
- claimCount: 1
- satisfiedClaims: 0
- warningClaims: 1
- warningCount: 4
- unlinkedCounterexamples: 0

## Claim status

| claim | status | required lanes | observed lanes | missing lanes | warnings |
| --- | --- | --- | --- | --- | --- |
| no-negative-stock | warning | behavior, model, spec | behavior | spec, model | all-evidence-derived-from-source, insufficient-independent-lanes, missing-spec-derived-evidence, unresolved-critical-counterexample |

## Lane coverage

| lane | required claims | observed claims |
| --- | --- | --- |
| spec | 1 | 0 |
| behavior | 1 | 1 |
| adversarial | 0 | 0 |
| model | 1 | 0 |
| proof | 0 | 0 |
| runtime | 0 | 0 |

## Warnings

- all-evidence-derived-from-source: claim=no-negative-stock All observed evidence for this claim is source-derived.
- missing-spec-derived-evidence: claim=no-negative-stock No spec-derived evidence was observed for this claim.
- insufficient-independent-lanes: claim=no-negative-stock Observed independent source kinds (1) do not meet the minimum (2).
- unresolved-critical-counterexample: claim=no-negative-stock Critical claim still has unresolved counterexamples.
