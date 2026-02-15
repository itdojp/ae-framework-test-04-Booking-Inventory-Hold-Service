import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const summaryPath = path.resolve(cwd, process.env.IN_SUMMARY ?? 'reports/ae-framework-runs-summary.json');
const outJsonPath = path.resolve(cwd, process.env.OUT_JSON ?? 'reports/formal-regression-alert.json');
const uniqueKey = process.env.ISSUE_UNIQUE_KEY ?? '[formal-regression-alert]';
const issueTitleBase = process.env.ISSUE_TITLE_BASE ?? 'Formal verification status regression detected';
const tools = ['csp', 'tla', 'smt', 'alloy'];

const statusRank = {
  passed: 0,
  ran: 0,
  unknown: 1,
  no_file: 2,
  file_not_found: 2,
  solver_not_available: 2,
  tool_not_available: 2,
  failed: 3
};

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function rankStatus(status) {
  if (typeof status !== 'string') return statusRank.unknown;
  if (Object.hasOwn(statusRank, status)) return statusRank[status];
  return statusRank.unknown;
}

function detectRegressions(summary) {
  const regressions = [];
  const formalDelta = summary.formalDelta ?? {};

  for (const tool of tools) {
    const delta = formalDelta[tool] ?? {};
    const previous = typeof delta.previous === 'string' ? delta.previous : null;
    const latest = typeof delta.latest === 'string' ? delta.latest : 'unknown';
    if (!previous) continue;
    if (rankStatus(latest) > rankStatus(previous)) {
      regressions.push({
        tool,
        previous,
        latest,
        severityDelta: rankStatus(latest) - rankStatus(previous)
      });
    }
  }

  regressions.sort((a, b) => b.severityDelta - a.severityDelta || a.tool.localeCompare(b.tool));
  return regressions;
}

function buildIssueBody(summary, regressions, nowIso) {
  const latestRun = summary.latestRun ?? {};
  const previousRun = Array.isArray(summary.runs) && summary.runs.length > 1 ? summary.runs[1] : null;
  const lines = [];
  lines.push('## Formal Verification Regression Detected');
  lines.push('');
  lines.push('Formal verification status has regressed compared to the previous run.');
  lines.push('');
  lines.push(`- detectedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push(`- latestRunId: ${latestRun.runId ?? '-'}`);
  lines.push(`- latestRunGeneratedAt: ${latestRun.generatedAt ?? '-'}`);
  lines.push(`- previousRunId: ${previousRun?.runId ?? '-'}`);
  lines.push(`- previousRunGeneratedAt: ${previousRun?.generatedAt ?? '-'}`);
  lines.push(`- runCount: ${summary.runCount ?? '-'}`);
  lines.push('');
  lines.push('### Regressed Tools');
  lines.push('');
  for (const reg of regressions) {
    lines.push(`- ${reg.tool}: ${reg.previous} -> ${reg.latest}`);
  }
  lines.push('');
  lines.push('### Required Action');
  lines.push('');
  lines.push('1. Inspect latest run artifacts under `artifacts/runs/<latest>/ae-framework-artifacts/hermetic-reports/formal/`.');
  lines.push('2. Identify whether regression is environment drift or specification/implementation regression.');
  lines.push('3. Apply fix and confirm `formalDelta` returns to non-regression state.');
  lines.push('');
  lines.push('### Tracking Key');
  lines.push('');
  lines.push(`- uniqueKey: ${uniqueKey}`);
  lines.push(`<!-- formal-regression-alert-key: ${uniqueKey} -->`);
  return `${lines.join('\n')}\n`;
}

function buildResolveComment(nowIso) {
  const lines = [];
  lines.push('Formal verification regression is no longer detected.');
  lines.push('');
  lines.push(`- resolvedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push('Auto-closing this tracking issue.');
  return `${lines.join('\n')}\n`;
}

if (!fs.existsSync(summaryPath)) {
  console.error(`[generate-formal-regression-alert] summary not found: ${summaryPath}`);
  process.exit(1);
}

let summary;
try {
  summary = readJson(summaryPath);
} catch (error) {
  console.error(`[generate-formal-regression-alert] failed to read summary: ${error.message}`);
  process.exit(1);
}

if (!summary || typeof summary !== 'object') {
  console.error('[generate-formal-regression-alert] summary is invalid');
  process.exit(1);
}

const nowIso = new Date().toISOString();
const regressions = detectRegressions(summary);
const hasBaseline = Array.isArray(summary.runs) && summary.runs.length > 1;
const shouldOpen = hasBaseline && regressions.length > 0;

let reason = 'no_regression';
if (!hasBaseline) {
  reason = 'insufficient_baseline';
} else if (regressions.length > 0) {
  reason = 'formal_regression_detected';
}

const payload = {
  generatedAt: nowIso,
  summaryPath: path.relative(cwd, summaryPath),
  issue: {
    uniqueKey,
    title: `${uniqueKey} ${issueTitleBase}`,
    shouldOpen,
    reason,
    body: shouldOpen ? buildIssueBody(summary, regressions, nowIso) : null,
    closeComment: buildResolveComment(nowIso)
  },
  regression: {
    hasBaseline,
    detected: regressions.length > 0,
    toolCount: regressions.length,
    tools: regressions
  }
};

ensureDir(outJsonPath);
fs.writeFileSync(outJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[generate-formal-regression-alert] shouldOpen=${payload.issue.shouldOpen ? 'yes' : 'no'}`);
console.log(`[generate-formal-regression-alert] reason=${payload.issue.reason}`);
console.log(`[generate-formal-regression-alert] json=${path.relative(cwd, outJsonPath)}`);
