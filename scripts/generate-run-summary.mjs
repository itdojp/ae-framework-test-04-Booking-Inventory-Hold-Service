import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const runsDir = path.resolve(cwd, process.env.RUNS_DIR ?? 'artifacts/runs');
const outJsonPath = path.resolve(cwd, process.env.OUT_JSON ?? 'reports/ae-framework-runs-summary.json');
const outMdPath = path.resolve(cwd, process.env.OUT_MD ?? 'reports/ae-framework-runs-summary.md');
const maxRows = Number(process.env.MAX_ROWS ?? 20);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const fixed = value >= 10 || i === 0 ? 0 : 1;
  return `${value.toFixed(fixed)} ${units[i]}`;
}

function walkDirSizeAndFiles(rootDir) {
  let totalBytes = 0;
  let fileCount = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        fileCount += 1;
        totalBytes += fs.statSync(fullPath).size;
      }
    }
  }
  return { totalBytes, fileCount };
}

function parseRunDirectories(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const runs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runFolder = entry.name;
    const runPath = path.join(dirPath, runFolder);
    const manifestPath = path.join(runPath, 'run-manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = readJson(manifestPath);
    if (!manifest) continue;

    const generatedAt = manifest.generatedAt ?? null;
    const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    const source = String(manifest.source ?? '');
    const sourceSha = source.includes('@') ? source.split('@').at(-1) : null;
    const { totalBytes, fileCount } = walkDirSizeAndFiles(runPath);

    runs.push({
      runFolder,
      runPath: path.relative(cwd, runPath),
      runId: String(manifest.runId ?? ''),
      runAttempt: String(manifest.runAttempt ?? ''),
      generatedAt,
      generatedAtMs,
      workflow: manifest.workflow ?? null,
      source,
      sourceSha,
      node: manifest.toolchain?.node ?? null,
      pnpm: manifest.toolchain?.pnpm ?? null,
      totalBytes,
      fileCount
    });
  }

  runs.sort((a, b) => {
    const ta = Number.isFinite(a.generatedAtMs) ? a.generatedAtMs : -Infinity;
    const tb = Number.isFinite(b.generatedAtMs) ? b.generatedAtMs : -Infinity;
    if (tb !== ta) return tb - ta;
    return b.runFolder.localeCompare(a.runFolder);
  });

  return runs;
}

function countBy(items, keySelector) {
  const map = {};
  for (const item of items) {
    const key = keySelector(item) ?? 'unknown';
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

function buildSummary(runs) {
  const totalBytes = runs.reduce((acc, run) => acc + run.totalBytes, 0);
  const totalFiles = runs.reduce((acc, run) => acc + run.fileCount, 0);
  const latest = runs[0] ?? null;
  const oldest = runs.length > 0 ? runs[runs.length - 1] : null;

  return {
    generatedAt: new Date().toISOString(),
    runCount: runs.length,
    totalBytes,
    totalFiles,
    averageBytesPerRun: runs.length > 0 ? Math.round(totalBytes / runs.length) : 0,
    latestRun: latest
      ? {
          runFolder: latest.runFolder,
          runId: latest.runId,
          runAttempt: latest.runAttempt,
          generatedAt: latest.generatedAt,
          source: latest.source,
          path: latest.runPath
        }
      : null,
    oldestRun: oldest
      ? {
          runFolder: oldest.runFolder,
          runId: oldest.runId,
          runAttempt: oldest.runAttempt,
          generatedAt: oldest.generatedAt,
          source: oldest.source,
          path: oldest.runPath
        }
      : null,
    workflowCounts: countBy(runs, (run) => run.workflow),
    nodeVersionCounts: countBy(runs, (run) => run.node),
    runs
  };
}

function buildMarkdown(summary, limit) {
  const lines = [];
  lines.push('# ae-framework Run Summary');
  lines.push('');
  lines.push(`- generatedAt: ${summary.generatedAt}`);
  lines.push(`- runCount: ${summary.runCount}`);
  lines.push(`- totalSize: ${formatBytes(summary.totalBytes)} (${summary.totalBytes} bytes)`);
  lines.push(`- totalFiles: ${summary.totalFiles}`);

  if (summary.latestRun) {
    lines.push(`- latestRun: ${summary.latestRun.runFolder} (runId=${summary.latestRun.runId}, generatedAt=${summary.latestRun.generatedAt})`);
  }
  if (summary.oldestRun) {
    lines.push(`- oldestRun: ${summary.oldestRun.runFolder} (runId=${summary.oldestRun.runId}, generatedAt=${summary.oldestRun.generatedAt})`);
  }

  lines.push('');
  lines.push('## Workflow Counts');
  lines.push('');
  lines.push('| workflow | count |');
  lines.push('| --- | ---: |');
  const workflowEntries = Object.entries(summary.workflowCounts).sort((a, b) => b[1] - a[1]);
  if (workflowEntries.length === 0) {
    lines.push('| (none) | 0 |');
  } else {
    for (const [workflow, count] of workflowEntries) {
      lines.push(`| ${workflow} | ${count} |`);
    }
  }

  lines.push('');
  lines.push(`## Recent Runs (latest ${limit})`);
  lines.push('');
  lines.push('| runFolder | runId | attempt | generatedAt | size | files | sourceSha |');
  lines.push('| --- | ---: | ---: | --- | ---: | ---: | --- |');
  for (const run of summary.runs.slice(0, limit)) {
    const sourceSha = run.sourceSha ? run.sourceSha.slice(0, 12) : '';
    lines.push(
      `| ${run.runFolder} | ${run.runId || '-'} | ${run.runAttempt || '-'} | ${run.generatedAt || '-'} | ${formatBytes(run.totalBytes)} | ${run.fileCount} | ${sourceSha} |`
    );
  }

  if (summary.runs.length === 0) {
    lines.push('| (no runs) | - | - | - | 0 B | 0 | - |');
  }

  return `${lines.join('\n')}\n`;
}

const runs = parseRunDirectories(runsDir);
const summary = buildSummary(runs);
const markdown = buildMarkdown(summary, Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 20);

ensureDir(outJsonPath);
ensureDir(outMdPath);
fs.writeFileSync(outJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
fs.writeFileSync(outMdPath, markdown, 'utf8');

console.log(`[generate-run-summary] runs=${summary.runCount}`);
console.log(`[generate-run-summary] json=${path.relative(cwd, outJsonPath)}`);
console.log(`[generate-run-summary] md=${path.relative(cwd, outMdPath)}`);
