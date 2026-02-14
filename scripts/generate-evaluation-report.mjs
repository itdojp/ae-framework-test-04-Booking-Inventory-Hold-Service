import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const summaryPath = path.resolve(cwd, process.env.IN_SUMMARY ?? 'reports/ae-framework-runs-summary.json');
const outPath = path.resolve(cwd, process.env.OUT_MD ?? 'reports/ae-framework-evaluation.md');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function bytesToMb(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 0;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function scoreFormal(latestFormal) {
  const tools = ['csp', 'tla', 'smt', 'alloy'];
  const notReadyStatuses = new Set(['tool_not_available', 'file_not_found', 'solver_not_available', 'no_file', 'unknown']);
  let ready = 0;
  for (const tool of tools) {
    const status = latestFormal?.[tool]?.status ?? 'unknown';
    if (!notReadyStatuses.has(status)) {
      ready += 1;
    }
  }
  return { ready, total: tools.length };
}

function buildEvaluation(summary) {
  const runCount = summary.runCount ?? 0;
  const totalSizeMb = bytesToMb(summary.totalBytes ?? 0);
  const latestRun = summary.latestRun ?? null;
  const workflowCount = summary.workflowCounts?.['ae-framework-autopilot'] ?? 0;
  const formal = scoreFormal(summary.latestFormal ?? {});

  let score = 0;
  if (runCount > 0) score += 30;
  if (workflowCount > 0) score += 20;
  score += Math.round((formal.ready / formal.total) * 50);

  let rating = 'C';
  if (score >= 85) rating = 'A';
  else if (score >= 70) rating = 'B';

  return {
    generatedAt: new Date().toISOString(),
    score,
    rating,
    runCount,
    totalSizeMb,
    latestRun,
    workflowCount,
    formalReady: formal,
    formalDelta: summary.formalDelta ?? {},
    projectSmtInputCount: Number(summary.projectFormalInputs?.smt?.fileCount ?? 0),
    actionItems: Array.isArray(summary.actionItems) ? summary.actionItems : []
  };
}

function renderMarkdown(evaluation, summary) {
  const lines = [];
  lines.push('# ae-framework Evaluation Report');
  lines.push('');
  lines.push(`- generatedAt: ${evaluation.generatedAt}`);
  lines.push(`- score: ${evaluation.score} / 100`);
  lines.push(`- rating: ${evaluation.rating}`);
  lines.push(`- runCount: ${evaluation.runCount}`);
  lines.push(`- totalArtifactSizeMB: ${evaluation.totalSizeMb}`);
  lines.push(`- autopilotRuns: ${evaluation.workflowCount}`);
  lines.push('');

  lines.push('## Snapshot');
  lines.push('');
  if (evaluation.latestRun) {
    lines.push(`- latestRunId: ${evaluation.latestRun.runId}`);
    lines.push(`- latestRunGeneratedAt: ${evaluation.latestRun.generatedAt}`);
    lines.push(`- latestSource: ${evaluation.latestRun.source}`);
    lines.push(`- latestArtifactPath: ${evaluation.latestRun.path}`);
  } else {
    lines.push('- latestRun: (none)');
  }

  lines.push('');
  lines.push('## Formal Readiness');
  lines.push('');
  lines.push(`- readyTools: ${evaluation.formalReady.ready} / ${evaluation.formalReady.total}`);
  lines.push(`- projectSmtInputs: ${evaluation.projectSmtInputCount}`);
  lines.push(`- csp: ${summary.latestFormal?.csp?.status ?? 'unknown'}`);
  lines.push(`- tla: ${summary.latestFormal?.tla?.status ?? 'unknown'}`);
  lines.push(`- smt: ${summary.latestFormal?.smt?.status ?? 'unknown'}`);
  lines.push(`- alloy: ${summary.latestFormal?.alloy?.status ?? 'unknown'}`);

  lines.push('');
  lines.push('## Formal Delta');
  lines.push('');
  for (const tool of ['csp', 'tla', 'smt', 'alloy']) {
    const row = evaluation.formalDelta?.[tool] ?? {};
    const previous = row.previous ?? '-';
    const latest = row.latest ?? summary.latestFormal?.[tool]?.status ?? 'unknown';
    const changed = row.changed ? 'changed' : 'same';
    lines.push(`- ${tool}: ${previous} -> ${latest} (${changed})`);
  }

  lines.push('');
  lines.push('## Recommended Actions');
  lines.push('');
  if (evaluation.actionItems.length === 0) {
    lines.push('- 現時点で推奨アクションはありません。');
  } else {
    for (const item of evaluation.actionItems) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

if (!fs.existsSync(summaryPath)) {
  console.error(`[generate-evaluation-report] summary not found: ${summaryPath}`);
  process.exit(1);
}

const summary = readJson(summaryPath);
const evaluation = buildEvaluation(summary);
const md = renderMarkdown(evaluation, summary);

ensureDir(outPath);
fs.writeFileSync(outPath, md, 'utf8');

console.log(`[generate-evaluation-report] summary=${path.relative(cwd, summaryPath)}`);
console.log(`[generate-evaluation-report] report=${path.relative(cwd, outPath)}`);
