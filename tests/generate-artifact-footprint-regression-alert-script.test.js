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

function runScript(summary, envOverrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-artifact-footprint-alert-'));
  const inSummary = path.join(tmp, 'reports', 'summary.json');
  const outJson = path.join(tmp, 'reports', 'artifact-footprint-regression-alert.json');
  writeJson(inSummary, summary);

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate-artifact-footprint-regression-alert.mjs');

  const proc = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      IN_SUMMARY: inSummary,
      OUT_JSON: outJson,
      ...envOverrides
    },
    encoding: 'utf8'
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  return JSON.parse(fs.readFileSync(outJson, 'utf8'));
}

function buildRuns(latest, baselineEntries) {
  return [latest, ...baselineEntries].map((entry, idx) => ({
    runId: String(900 - idx),
    runAttempt: '1',
    generatedAt: `2026-02-16T00:${String(idx).padStart(2, '0')}:00Z`,
    totalBytes: entry.totalBytes,
    fileCount: entry.fileCount
  }));
}

test('generate-artifact-footprint-regression-alert script: artifact size 増加回帰を検知する', () => {
  const payload = runScript({
    runs: buildRuns(
      { totalBytes: 3000, fileCount: 100 },
      [
        { totalBytes: 1000, fileCount: 100 },
        { totalBytes: 1000, fileCount: 100 },
        { totalBytes: 1100, fileCount: 100 },
        { totalBytes: 1000, fileCount: 100 },
        { totalBytes: 900, fileCount: 100 }
      ]
    )
  });

  assert.equal(payload.issue.shouldOpen, true);
  assert.equal(payload.issue.reason, 'footprint_regression_detected');
  assert.match(payload.issue.body, /Artifact Footprint Regression Detected/);
  assert.ok(payload.regression.breaches.some((breach) => breach.key === 'bytes_ratio_too_high'));
});

test('generate-artifact-footprint-regression-alert script: 閾値内なら起票しない', () => {
  const payload = runScript({
    runs: buildRuns(
      { totalBytes: 1080, fileCount: 102 },
      [
        { totalBytes: 1000, fileCount: 100 },
        { totalBytes: 980, fileCount: 98 },
        { totalBytes: 1020, fileCount: 101 },
        { totalBytes: 990, fileCount: 99 },
        { totalBytes: 1010, fileCount: 100 }
      ]
    )
  });

  assert.equal(payload.issue.shouldOpen, false);
  assert.equal(payload.issue.reason, 'no_regression');
  assert.equal(payload.issue.body, null);
  assert.match(payload.issue.closeComment, /Auto-closing this tracking issue/);
});

test('generate-artifact-footprint-regression-alert script: baseline不足なら起票しない', () => {
  const payload = runScript({
    runs: buildRuns(
      { totalBytes: 6000, fileCount: 200 },
      [
        { totalBytes: 1000, fileCount: 100 },
        { totalBytes: 1000, fileCount: 100 }
      ]
    )
  });

  assert.equal(payload.issue.shouldOpen, false);
  assert.equal(payload.issue.reason, 'insufficient_baseline');
  assert.equal(payload.regression.hasBaseline, false);
});
