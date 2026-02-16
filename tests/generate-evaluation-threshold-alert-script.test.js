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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-evaluation-threshold-alert-'));
  const inSummary = path.join(tmp, 'reports', 'summary.json');
  const outJson = path.join(tmp, 'reports', 'evaluation-threshold-alert.json');
  writeJson(inSummary, summary);

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate-evaluation-threshold-alert.mjs');

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

test('generate-evaluation-threshold-alert script: 閾値未達なら Issue 起票情報を生成する', () => {
  const payload = runScript({
    runCount: 10,
    workflowCounts: { 'ae-framework-autopilot': 10 },
    latestRun: {
      runId: '500',
      runAttempt: '1',
      generatedAt: '2026-02-16T00:00:00Z'
    },
    latestFormal: {
      csp: { status: 'ran', ok: true },
      tla: { status: 'failed', ok: false },
      smt: { status: 'tool_not_available', ok: null },
      alloy: { status: 'ran', ok: true }
    },
    artifactPolicy: {
      configured: true,
      valid: true,
      preserveAllArtifacts: true,
      review: {
        overdue: false
      }
    }
  });

  assert.equal(payload.issue.shouldOpen, true);
  assert.equal(payload.issue.reason, 'threshold_breached');
  assert.equal(payload.evaluation.score, 88);
  assert.equal(payload.evaluation.formal.ready, 3);
  assert.equal(payload.evaluation.formal.healthy, 2);
  assert.match(payload.issue.body, /Evaluation Threshold Breach/);
  assert.match(payload.issue.body, /score: 88/);
  assert.ok(payload.breaches.some((breach) => breach.key === 'score'));
  assert.ok(payload.breaches.some((breach) => breach.key === 'formal_ready'));
  assert.ok(payload.breaches.some((breach) => breach.key === 'formal_healthy'));
});

test('generate-evaluation-threshold-alert script: 閾値内なら Issue を起票しない', () => {
  const payload = runScript({
    runCount: 12,
    workflowCounts: { 'ae-framework-autopilot': 12 },
    latestRun: {
      runId: '600',
      runAttempt: '1',
      generatedAt: '2026-02-16T01:00:00Z'
    },
    latestFormal: {
      csp: { status: 'ran', ok: true },
      tla: { status: 'ran', ok: true },
      smt: { status: 'ran', ok: true },
      alloy: { status: 'ran', ok: true }
    },
    artifactPolicy: {
      configured: true,
      valid: true,
      preserveAllArtifacts: true,
      review: {
        overdue: false
      }
    }
  });

  assert.equal(payload.issue.shouldOpen, false);
  assert.equal(payload.issue.reason, 'within_threshold');
  assert.equal(payload.issue.body, null);
  assert.equal(payload.evaluation.score, 100);
  assert.equal(payload.evaluation.rating, 'A');
  assert.match(payload.issue.closeComment, /Auto-closing this tracking issue/);
});
