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

test('generate-evaluation-report script: run summary から評価レポートを生成する', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-eval-report-'));
  const summaryPath = path.join(tmp, 'reports', 'summary.json');
  const outPath = path.join(tmp, 'reports', 'evaluation.md');

  writeJson(summaryPath, {
    runCount: 5,
    totalBytes: 10 * 1024 * 1024,
    workflowCounts: { 'ae-framework-autopilot': 5 },
    latestRun: {
      runId: '12345',
      generatedAt: '2026-02-14T08:00:00Z',
      source: 'itdojp/example@abc',
      path: 'artifacts/runs/sample'
    },
    latestFormal: {
      csp: { status: 'tool_not_available' },
      tla: { status: 'tool_not_available' },
      smt: { status: 'file_not_found' },
      alloy: { status: 'tool_not_available' }
    },
    formalDelta: {
      csp: { previous: 'tool_not_available', latest: 'tool_not_available', changed: false },
      tla: { previous: 'tool_not_available', latest: 'tool_not_available', changed: false },
      smt: { previous: 'file_not_found', latest: 'solver_not_available', changed: true },
      alloy: { previous: 'tool_not_available', latest: 'tool_not_available', changed: false }
    },
    projectFormalInputs: {
      smt: {
        inputDir: 'spec/formal/smt',
        fileCount: 1,
        files: ['spec/formal/smt/bi-hold-invariants.smt2']
      }
    },
    actionItems: ['CSP setup required']
  });

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate-evaluation-report.mjs');

  const proc = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      IN_SUMMARY: summaryPath,
      OUT_MD: outPath
    },
    encoding: 'utf8'
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.ok(fs.existsSync(outPath));

  const md = fs.readFileSync(outPath, 'utf8');
  assert.match(md, /ae-framework Evaluation Report/);
  assert.match(md, /score: 50 \/ 100/);
  assert.match(md, /rating: C/);
  assert.match(md, /latestRunId: 12345/);
  assert.match(md, /projectSmtInputs: 1/);
  assert.match(md, /smt: file_not_found -> solver_not_available \(changed\)/);
  assert.match(md, /CSP setup required/);
});
