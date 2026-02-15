import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const summaryPath = path.resolve(cwd, process.env.IN_SUMMARY ?? 'reports/ae-framework-runs-summary.json');
const expectedRunId = String(process.env.CURRENT_RUN_ID ?? '').trim();
const expectedRunAttempt = String(process.env.CURRENT_RUN_ATTEMPT ?? '').trim();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(`[validate-report-freshness] ${message}`);
  process.exit(1);
}

if (!expectedRunId) {
  fail('CURRENT_RUN_ID is required.');
}

if (!expectedRunAttempt) {
  fail('CURRENT_RUN_ATTEMPT is required.');
}

if (!fs.existsSync(summaryPath)) {
  fail(`summary not found: ${summaryPath}`);
}

let summary;
try {
  summary = readJson(summaryPath);
} catch (error) {
  fail(`failed to read summary: ${error.message}`);
}

if (!summary || typeof summary !== 'object') {
  fail('summary is invalid.');
}

const latestRun = summary.latestRun ?? null;
if (!latestRun || typeof latestRun !== 'object') {
  fail('latestRun is missing in summary.');
}

const latestRunId = String(latestRun.runId ?? '');
const latestRunAttempt = String(latestRun.runAttempt ?? '');

if (latestRunId !== expectedRunId) {
  fail(`latestRunId mismatch: expected=${expectedRunId}, actual=${latestRunId}`);
}

if (latestRunAttempt !== expectedRunAttempt) {
  fail(`latestRunAttempt mismatch: expected=${expectedRunAttempt}, actual=${latestRunAttempt}`);
}

const hasRunInRows = Array.isArray(summary.runs)
  ? summary.runs.some(
      (run) =>
        String(run?.runId ?? '') === expectedRunId &&
        String(run?.runAttempt ?? '') === expectedRunAttempt
    )
  : false;

if (!hasRunInRows) {
  fail(`runs[] does not include runId=${expectedRunId} attempt=${expectedRunAttempt}`);
}

console.log(
  `[validate-report-freshness] ok runId=${expectedRunId} runAttempt=${expectedRunAttempt} summary=${path.relative(cwd, summaryPath)}`
);
