import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const summaryPath = path.resolve(cwd, process.env.IN_SUMMARY ?? 'reports/ae-framework-runs-summary.json');
const outJsonPath = path.resolve(cwd, process.env.OUT_JSON ?? 'reports/artifact-footprint-regression-alert.json');
const uniqueKey = process.env.ISSUE_UNIQUE_KEY ?? '[artifact-footprint-regression-alert]';
const issueTitleBase = process.env.ISSUE_TITLE_BASE ?? 'Artifact footprint regression detected';

const baselineWindow = toFiniteInt(process.env.BASELINE_WINDOW, 10);
const minBaselineRuns = toFiniteInt(process.env.MIN_BASELINE_RUNS, 5);
const minBytesRatio = toFiniteNumber(process.env.MIN_BYTES_RATIO, 0.6);
const maxBytesRatio = toFiniteNumber(process.env.MAX_BYTES_RATIO, 1.8);
const minFilesRatio = toFiniteNumber(process.env.MIN_FILES_RATIO, 0.6);
const maxFilesRatio = toFiniteNumber(process.env.MAX_FILES_RATIO, 1.8);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toFiniteInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectRegression(summary) {
  const runs = Array.isArray(summary.runs) ? summary.runs : [];
  const latest = runs[0] ?? null;
  const baselineRuns = runs.slice(1, 1 + baselineWindow);
  const hasBaseline = baselineRuns.length >= minBaselineRuns;

  const baselineBytes = baselineRuns.map((run) => Number(run?.totalBytes ?? Number.NaN)).filter(Number.isFinite);
  const baselineFiles = baselineRuns.map((run) => Number(run?.fileCount ?? Number.NaN)).filter(Number.isFinite);
  const baselineMedianBytes = median(baselineBytes);
  const baselineMedianFiles = median(baselineFiles);

  const latestBytes = Number(latest?.totalBytes ?? Number.NaN);
  const latestFiles = Number(latest?.fileCount ?? Number.NaN);
  const bytesRatio = Number.isFinite(latestBytes) && Number.isFinite(baselineMedianBytes) && baselineMedianBytes > 0
    ? latestBytes / baselineMedianBytes
    : null;
  const filesRatio = Number.isFinite(latestFiles) && Number.isFinite(baselineMedianFiles) && baselineMedianFiles > 0
    ? latestFiles / baselineMedianFiles
    : null;

  const breaches = [];
  if (hasBaseline && Number.isFinite(bytesRatio)) {
    if (bytesRatio < minBytesRatio) {
      breaches.push({
        key: 'bytes_ratio_too_low',
        expected: `>= ${minBytesRatio}`,
        actual: bytesRatio.toFixed(3)
      });
    } else if (bytesRatio > maxBytesRatio) {
      breaches.push({
        key: 'bytes_ratio_too_high',
        expected: `<= ${maxBytesRatio}`,
        actual: bytesRatio.toFixed(3)
      });
    }
  }

  if (hasBaseline && Number.isFinite(filesRatio)) {
    if (filesRatio < minFilesRatio) {
      breaches.push({
        key: 'files_ratio_too_low',
        expected: `>= ${minFilesRatio}`,
        actual: filesRatio.toFixed(3)
      });
    } else if (filesRatio > maxFilesRatio) {
      breaches.push({
        key: 'files_ratio_too_high',
        expected: `<= ${maxFilesRatio}`,
        actual: filesRatio.toFixed(3)
      });
    }
  }

  let reason = 'no_regression';
  if (!hasBaseline) {
    reason = 'insufficient_baseline';
  } else if (breaches.length > 0) {
    reason = 'footprint_regression_detected';
  }

  return {
    hasBaseline,
    reason,
    breaches,
    latest: {
      runId: String(latest?.runId ?? ''),
      runAttempt: String(latest?.runAttempt ?? ''),
      generatedAt: typeof latest?.generatedAt === 'string' ? latest.generatedAt : null,
      totalBytes: Number.isFinite(latestBytes) ? latestBytes : null,
      fileCount: Number.isFinite(latestFiles) ? latestFiles : null
    },
    baseline: {
      sampleCount: baselineRuns.length,
      medianBytes: Number.isFinite(baselineMedianBytes) ? baselineMedianBytes : null,
      medianFiles: Number.isFinite(baselineMedianFiles) ? baselineMedianFiles : null,
      bytesRatio: Number.isFinite(bytesRatio) ? bytesRatio : null,
      filesRatio: Number.isFinite(filesRatio) ? filesRatio : null
    }
  };
}

function buildIssueBody(regression, nowIso) {
  const lines = [];
  lines.push('## Artifact Footprint Regression Detected');
  lines.push('');
  lines.push('Latest run artifact footprint differs significantly from recent baseline.');
  lines.push('');
  lines.push(`- detectedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push(`- latestRunId: ${regression.latest.runId || '-'}`);
  lines.push(`- latestRunAttempt: ${regression.latest.runAttempt || '-'}`);
  lines.push(`- latestGeneratedAt: ${regression.latest.generatedAt ?? '-'}`);
  lines.push(`- latestTotalBytes: ${regression.latest.totalBytes ?? '-'}`);
  lines.push(`- latestFileCount: ${regression.latest.fileCount ?? '-'}`);
  lines.push(`- baselineSampleCount: ${regression.baseline.sampleCount}`);
  lines.push(`- baselineMedianBytes: ${regression.baseline.medianBytes ?? '-'}`);
  lines.push(`- baselineMedianFiles: ${regression.baseline.medianFiles ?? '-'}`);
  lines.push(`- bytesRatio(latest/median): ${regression.baseline.bytesRatio?.toFixed(3) ?? '-'}`);
  lines.push(`- filesRatio(latest/median): ${regression.baseline.filesRatio?.toFixed(3) ?? '-'}`);
  lines.push('');
  lines.push('### Thresholds');
  lines.push('');
  lines.push(`- baselineWindow: ${baselineWindow}`);
  lines.push(`- minBaselineRuns: ${minBaselineRuns}`);
  lines.push(`- minBytesRatio: ${minBytesRatio}`);
  lines.push(`- maxBytesRatio: ${maxBytesRatio}`);
  lines.push(`- minFilesRatio: ${minFilesRatio}`);
  lines.push(`- maxFilesRatio: ${maxFilesRatio}`);
  lines.push('');
  lines.push('### Breaches');
  lines.push('');
  for (const breach of regression.breaches) {
    lines.push(`- ${breach.key}: expected ${breach.expected}, actual ${breach.actual}`);
  }
  lines.push('');
  lines.push('### Required Action');
  lines.push('');
  lines.push('1. Compare latest run-manifest and collected directories with previous runs.');
  lines.push('2. Check for missing collection or accidental artifact explosion.');
  lines.push('3. Re-run autopilot after correction and confirm ratios return within thresholds.');
  lines.push('');
  lines.push('### Tracking Key');
  lines.push('');
  lines.push(`- uniqueKey: ${uniqueKey}`);
  lines.push(`<!-- artifact-footprint-regression-alert-key: ${uniqueKey} -->`);
  return `${lines.join('\n')}\n`;
}

function buildResolveComment(nowIso) {
  const lines = [];
  lines.push('Artifact footprint regression is no longer detected.');
  lines.push('');
  lines.push(`- resolvedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push('Auto-closing this tracking issue.');
  return `${lines.join('\n')}\n`;
}

if (!fs.existsSync(summaryPath)) {
  console.error(`[generate-artifact-footprint-regression-alert] summary not found: ${summaryPath}`);
  process.exit(1);
}

let summary;
try {
  summary = readJson(summaryPath);
} catch (error) {
  console.error(`[generate-artifact-footprint-regression-alert] failed to read summary: ${error.message}`);
  process.exit(1);
}

if (!summary || typeof summary !== 'object') {
  console.error('[generate-artifact-footprint-regression-alert] summary is invalid');
  process.exit(1);
}

const nowIso = new Date().toISOString();
const regression = detectRegression(summary);
const shouldOpen = regression.hasBaseline && regression.breaches.length > 0;

const payload = {
  generatedAt: nowIso,
  summaryPath: path.relative(cwd, summaryPath),
  thresholds: {
    baselineWindow,
    minBaselineRuns,
    minBytesRatio,
    maxBytesRatio,
    minFilesRatio,
    maxFilesRatio
  },
  regression,
  issue: {
    uniqueKey,
    title: `${uniqueKey} ${issueTitleBase}`,
    shouldOpen,
    reason: regression.reason,
    body: shouldOpen ? buildIssueBody(regression, nowIso) : null,
    closeComment: buildResolveComment(nowIso)
  }
};

ensureDir(outJsonPath);
fs.writeFileSync(outJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[generate-artifact-footprint-regression-alert] shouldOpen=${payload.issue.shouldOpen ? 'yes' : 'no'}`);
console.log(`[generate-artifact-footprint-regression-alert] reason=${payload.issue.reason}`);
console.log(`[generate-artifact-footprint-regression-alert] json=${path.relative(cwd, outJsonPath)}`);
