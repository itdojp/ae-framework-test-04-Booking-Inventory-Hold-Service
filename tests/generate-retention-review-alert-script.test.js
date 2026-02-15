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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-retention-alert-'));
  const inSummary = path.join(tmp, 'reports', 'summary.json');
  const outJson = path.join(tmp, 'reports', 'retention-alert.json');
  writeJson(inSummary, summary);

  const testFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(testFile), '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'generate-retention-review-alert.mjs');

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

test('generate-retention-review-alert script: reviewOverdue=true のとき Issue 起票情報を出力する', () => {
  const payload = runScript({
    runCount: 31,
    artifactPolicy: {
      path: 'configs/artifact-retention/policy.json',
      configured: true,
      valid: true,
      mode: 'keep_all_on_github',
      preserveAllArtifacts: true,
      review: {
        lastReviewedAt: '2025-12-01',
        maxAgeDays: 30,
        ageDays: 76,
        overdue: true
      }
    }
  });

  assert.equal(payload.issue.shouldOpen, true);
  assert.equal(payload.issue.reason, 'review_overdue');
  assert.match(payload.issue.title, /\[artifact-retention-review\]/);
  assert.match(payload.issue.body, /Artifact Retention Review Overdue/);
  assert.match(payload.issue.body, /reviewAgeDays: 76/);
});

test('generate-retention-review-alert script: reviewOverdue=false のとき Issue を起票しない', () => {
  const payload = runScript({
    runCount: 31,
    artifactPolicy: {
      path: 'configs/artifact-retention/policy.json',
      configured: true,
      valid: true,
      mode: 'keep_all_on_github',
      preserveAllArtifacts: true,
      review: {
        lastReviewedAt: '2026-02-14',
        maxAgeDays: 30,
        ageDays: 1,
        overdue: false
      }
    }
  });

  assert.equal(payload.issue.shouldOpen, false);
  assert.equal(payload.issue.reason, 'review_ok');
  assert.equal(payload.issue.body, null);
  assert.match(payload.issue.closeComment, /Auto-closing this tracking issue/);
});
