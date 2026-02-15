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

function runScript(summary, env = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-validate-freshness-'));
  const summaryPath = path.join(tmp, 'reports', 'summary.json');
  writeJson(summaryPath, summary);

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'validate-report-freshness.mjs');

  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      IN_SUMMARY: summaryPath,
      CURRENT_RUN_ID: '1001',
      CURRENT_RUN_ATTEMPT: '2',
      ...env
    },
    encoding: 'utf8'
  });
}

test('validate-report-freshness script: 最新run一致時は成功', () => {
  const proc = runScript({
    latestRun: {
      runId: '1001',
      runAttempt: '2'
    },
    runs: [
      { runId: '1001', runAttempt: '2' },
      { runId: '1000', runAttempt: '1' }
    ]
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.match(proc.stdout, /ok runId=1001 runAttempt=2/);
});

test('validate-report-freshness script: 最新run不一致時は失敗', () => {
  const proc = runScript({
    latestRun: {
      runId: '9999',
      runAttempt: '1'
    },
    runs: [{ runId: '9999', runAttempt: '1' }]
  });

  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /latestRunId mismatch/);
});
