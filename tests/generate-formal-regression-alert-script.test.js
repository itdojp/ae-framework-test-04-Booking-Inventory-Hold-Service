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

function runScript(summary) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-formal-regression-alert-'));
  const inSummary = path.join(tmp, 'reports', 'summary.json');
  const outJson = path.join(tmp, 'reports', 'formal-regression-alert.json');
  writeJson(inSummary, summary);

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate-formal-regression-alert.mjs');

  const proc = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      IN_SUMMARY: inSummary,
      OUT_JSON: outJson
    },
    encoding: 'utf8'
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  return JSON.parse(fs.readFileSync(outJson, 'utf8'));
}

test('generate-formal-regression-alert script: formalDelta が劣化した場合は Issue 起票情報を出力する', () => {
  const payload = runScript({
    runCount: 10,
    latestRun: {
      runId: '500',
      generatedAt: '2026-02-15T10:00:00Z'
    },
    runs: [
      { runId: '500', generatedAt: '2026-02-15T10:00:00Z' },
      { runId: '499', generatedAt: '2026-02-15T09:00:00Z' }
    ],
    formalDelta: {
      csp: { previous: 'ran', latest: 'tool_not_available', changed: true },
      tla: { previous: 'ran', latest: 'ran', changed: false },
      smt: { previous: 'ran', latest: 'failed', changed: true },
      alloy: { previous: 'ran', latest: 'ran', changed: false }
    }
  });

  assert.equal(payload.issue.shouldOpen, true);
  assert.equal(payload.issue.reason, 'formal_regression_detected');
  assert.equal(payload.regression.detected, true);
  assert.equal(payload.regression.toolCount, 2);
  assert.match(payload.issue.body, /Formal Verification Regression Detected/);
  assert.match(payload.issue.body, /csp: ran -> tool_not_available/);
  assert.match(payload.issue.body, /smt: ran -> failed/);
});

test('generate-formal-regression-alert script: 非劣化またはベースライン不足の場合は起票しない', () => {
  const payloadNoRegression = runScript({
    runCount: 10,
    latestRun: { runId: '600', generatedAt: '2026-02-15T11:00:00Z' },
    runs: [
      { runId: '600', generatedAt: '2026-02-15T11:00:00Z' },
      { runId: '599', generatedAt: '2026-02-15T10:00:00Z' }
    ],
    formalDelta: {
      csp: { previous: 'tool_not_available', latest: 'ran', changed: true },
      tla: { previous: 'ran', latest: 'ran', changed: false },
      smt: { previous: 'failed', latest: 'ran', changed: true },
      alloy: { previous: 'ran', latest: 'ran', changed: false }
    }
  });

  assert.equal(payloadNoRegression.issue.shouldOpen, false);
  assert.equal(payloadNoRegression.issue.reason, 'no_regression');
  assert.equal(payloadNoRegression.regression.detected, false);
  assert.equal(payloadNoRegression.issue.body, null);

  const payloadInsufficient = runScript({
    runCount: 1,
    latestRun: { runId: '700', generatedAt: '2026-02-15T12:00:00Z' },
    runs: [{ runId: '700', generatedAt: '2026-02-15T12:00:00Z' }],
    formalDelta: {}
  });

  assert.equal(payloadInsufficient.issue.shouldOpen, false);
  assert.equal(payloadInsufficient.issue.reason, 'insufficient_baseline');
  assert.equal(payloadInsufficient.regression.hasBaseline, false);
  assert.match(payloadInsufficient.issue.closeComment, /Auto-closing this tracking issue/);
});
