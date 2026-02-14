import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

test('generate-run-summary script: run-manifest 群から summary を生成する', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-run-summary-'));
  const runsDir = path.join(tmp, 'artifacts', 'runs');
  const outJson = path.join(tmp, 'reports', 'summary.json');
  const outMd = path.join(tmp, 'reports', 'summary.md');
  const smtInputDir = path.join(tmp, 'spec', 'formal', 'smt');

  const runA = path.join(runsDir, '20260214T060000Z-100-1');
  const runB = path.join(runsDir, '20260214T070000Z-101-1');

  writeJson(path.join(runA, 'run-manifest.json'), {
    generatedAt: '2026-02-14T06:00:00Z',
    workflow: 'ae-framework-autopilot',
    runId: '100',
    runAttempt: '1',
    source: 'itdojp/example@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    toolchain: { node: '22', pnpm: '10' }
  });
  fs.writeFileSync(path.join(runA, 'dummy.txt'), 'abc', 'utf8');
  writeJson(path.join(runA, 'ae-framework-artifacts', 'hermetic-reports', 'formal', 'csp-summary.json'), {
    status: 'tool_not_available',
    ran: false,
    timestamp: '2026-02-14T06:00:10Z'
  });
  writeJson(path.join(runA, 'ae-framework-artifacts', 'hermetic-reports', 'formal', 'tla-summary.json'), {
    status: 'tool_not_available',
    ran: false,
    timestamp: '2026-02-14T06:00:12Z'
  });

  writeJson(path.join(runB, 'run-manifest.json'), {
    generatedAt: '2026-02-14T07:00:00Z',
    workflow: 'ae-framework-autopilot',
    runId: '101',
    runAttempt: '1',
    source: 'itdojp/example@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    toolchain: { node: '22', pnpm: '10' }
  });
  fs.writeFileSync(path.join(runB, 'dummy.txt'), 'abcdef', 'utf8');
  writeJson(path.join(runB, 'ae-framework-artifacts', 'hermetic-reports', 'formal', 'csp-summary.json'), {
    status: 'passed',
    ran: true,
    ok: true,
    timestamp: '2026-02-14T07:00:10Z'
  });
  writeJson(path.join(runB, 'ae-framework-artifacts', 'hermetic-reports', 'formal', 'tla-summary.json'), {
    status: 'tool_not_available',
    ran: false,
    timestamp: '2026-02-14T07:00:12Z'
  });
  writeJson(path.join(runB, 'ae-framework-artifacts', 'hermetic-reports', 'formal', 'smt-summary.json'), {
    status: 'file_not_found',
    ran: false,
    timestamp: '2026-02-14T07:00:13Z'
  });
  fs.mkdirSync(smtInputDir, { recursive: true });
  fs.writeFileSync(path.join(smtInputDir, 'bi-hold-invariants.smt2'), '(set-logic QF_LIA)\n', 'utf8');

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate-run-summary.mjs');

  const proc = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      RUNS_DIR: runsDir,
      OUT_JSON: outJson,
      OUT_MD: outMd,
      MAX_ROWS: '10',
      SMT_INPUT_DIR: smtInputDir
    },
    encoding: 'utf8'
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.ok(fs.existsSync(outJson));
  assert.ok(fs.existsSync(outMd));

  const summary = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  assert.equal(summary.runCount, 2);
  assert.equal(summary.latestRun.runId, '101');
  assert.equal(summary.oldestRun.runId, '100');
  assert.equal(summary.workflowCounts['ae-framework-autopilot'], 2);
  assert.ok(summary.totalBytes > 0);
  assert.equal(summary.formalStatusCounts.csp.tool_not_available, 1);
  assert.equal(summary.formalStatusCounts.csp.passed, 1);
  assert.equal(summary.formalStatusCounts.tla.tool_not_available, 2);
  assert.equal(summary.formalStatusCounts.smt.file_not_found, 1);
  assert.equal(summary.projectFormalInputs.smt.fileCount, 1);
  assert.ok(Array.isArray(summary.actionItems));
  assert.ok(summary.actionItems.length >= 1);
  assert.match(summary.actionItems.join('\n'), /TLA\+/);
  assert.match(summary.actionItems.join('\n'), /参照する入力パスを CI で固定/);

  const md = fs.readFileSync(outMd, 'utf8');
  assert.match(md, /ae-framework Run Summary/);
  assert.match(md, /Formal Status Counts/);
  assert.match(md, /Project Formal Inputs/);
  assert.match(md, /Action Items/);
  assert.match(md, /csp:passed/);
  assert.match(md, /20260214T070000Z-101-1/);
});

test('generate-run-summary script: smt solver_not_available のとき導入アクションを出力する', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-run-summary-smt-'));
  const runsDir = path.join(tmp, 'artifacts', 'runs');
  const outJson = path.join(tmp, 'reports', 'summary.json');
  const outMd = path.join(tmp, 'reports', 'summary.md');
  const smtInputDir = path.join(tmp, 'spec', 'formal', 'smt');

  const runA = path.join(runsDir, '20260214T080000Z-200-1');
  writeJson(path.join(runA, 'run-manifest.json'), {
    generatedAt: '2026-02-14T08:00:00Z',
    workflow: 'ae-framework-autopilot',
    runId: '200',
    runAttempt: '1',
    source: 'itdojp/example@cccccccccccccccccccccccccccccccccccccccc',
    toolchain: { node: '22', pnpm: '10' }
  });
  writeJson(path.join(runA, 'ae-framework-artifacts', 'hermetic-reports', 'formal', 'smt-summary.json'), {
    status: 'solver_not_available',
    ran: false,
    timestamp: '2026-02-14T08:00:10Z'
  });
  fs.mkdirSync(smtInputDir, { recursive: true });
  fs.writeFileSync(path.join(smtInputDir, 'bi-hold-invariants.smt2'), '(set-logic QF_LIA)\n', 'utf8');

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate-run-summary.mjs');

  const proc = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      RUNS_DIR: runsDir,
      OUT_JSON: outJson,
      OUT_MD: outMd,
      MAX_ROWS: '10',
      SMT_INPUT_DIR: smtInputDir
    },
    encoding: 'utf8'
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  const summary = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  assert.equal(summary.runCount, 1);
  assert.equal(summary.latestFormal.smt.status, 'solver_not_available');
  assert.match(summary.actionItems.join('\n'), /z3 または cvc5/);
});
