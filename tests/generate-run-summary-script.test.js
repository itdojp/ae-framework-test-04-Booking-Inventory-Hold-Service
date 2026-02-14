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

  writeJson(path.join(runB, 'run-manifest.json'), {
    generatedAt: '2026-02-14T07:00:00Z',
    workflow: 'ae-framework-autopilot',
    runId: '101',
    runAttempt: '1',
    source: 'itdojp/example@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    toolchain: { node: '22', pnpm: '10' }
  });
  fs.writeFileSync(path.join(runB, 'dummy.txt'), 'abcdef', 'utf8');

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
      MAX_ROWS: '10'
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

  const md = fs.readFileSync(outMd, 'utf8');
  assert.match(md, /ae-framework Run Summary/);
  assert.match(md, /20260214T070000Z-101-1/);
});
