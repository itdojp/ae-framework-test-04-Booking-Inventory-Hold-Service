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
  assert.match(md, /CSP setup required/);
});
