import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const runsDir = path.resolve(cwd, process.env.RUNS_DIR ?? 'artifacts/runs');
const outJsonPath = path.resolve(cwd, process.env.OUT_JSON ?? 'reports/ae-framework-runs-summary.json');
const outMdPath = path.resolve(cwd, process.env.OUT_MD ?? 'reports/ae-framework-runs-summary.md');
const maxRows = Number(process.env.MAX_ROWS ?? 20);
const smtInputDir = path.resolve(cwd, process.env.SMT_INPUT_DIR ?? 'spec/formal/smt');
const artifactPolicyPath = path.resolve(
  cwd,
  process.env.ARTIFACT_POLICY_FILE ?? 'configs/artifact-retention/policy.json'
);
const formalToolFiles = {
  csp: 'csp-summary.json',
  tla: 'tla-summary.json',
  smt: 'smt-summary.json',
  alloy: 'alloy-summary.json'
};

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

function listFilesByExtension(rootDir, extension) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(path.relative(cwd, fullPath));
      }
    }
  }
  files.sort();
  return files;
}

function parseFormalSummaries(runPath) {
  const formalDir = path.join(runPath, 'ae-framework-artifacts', 'hermetic-reports', 'formal');
  if (!fs.existsSync(formalDir)) return {};
  const summary = {};
  for (const [tool, fileName] of Object.entries(formalToolFiles)) {
    const filePath = path.join(formalDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    const payload = readJson(filePath);
    if (!payload) continue;
    summary[tool] = {
      status: typeof payload.status === 'string' ? payload.status : 'unknown',
      ran: typeof payload.ran === 'boolean' ? payload.ran : null,
      ok: typeof payload.ok === 'boolean' ? payload.ok : null,
      timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : null
    };
  }
  return summary;
}

function collectProjectFormalInputs() {
  const smtFiles = listFilesByExtension(smtInputDir, '.smt2');
  return {
    smt: {
      inputDir: path.relative(cwd, smtInputDir),
      fileCount: smtFiles.length,
      files: smtFiles.slice(0, 20)
    }
  };
}

function parseArtifactPolicy() {
  const relPath = path.relative(cwd, artifactPolicyPath);
  if (!fs.existsSync(artifactPolicyPath)) {
    return {
      path: relPath,
      configured: false,
      valid: false,
      mode: null,
      preserveAllArtifacts: null,
      review: {
        lastReviewedAt: null,
        maxAgeDays: null,
        ageDays: null,
        overdue: null
      }
    };
  }

  const payload = readJson(artifactPolicyPath);
  if (!payload || typeof payload !== 'object') {
    return {
      path: relPath,
      configured: true,
      valid: false,
      mode: null,
      preserveAllArtifacts: null,
      review: {
        lastReviewedAt: null,
        maxAgeDays: null,
        ageDays: null,
        overdue: null
      }
    };
  }

  const mode = typeof payload.mode === 'string' ? payload.mode : null;
  const preserveAllArtifacts = payload.preserveAllArtifacts === true;
  const lastReviewedAt = typeof payload.review?.lastReviewedAt === 'string' ? payload.review.lastReviewedAt : null;
  const maxAgeDaysRaw = Number(payload.review?.maxAgeDays);
  const maxAgeDays = Number.isFinite(maxAgeDaysRaw) && maxAgeDaysRaw >= 0 ? maxAgeDaysRaw : null;
  const reviewedAtMs = lastReviewedAt ? Date.parse(lastReviewedAt) : Number.NaN;
  const reviewAgeDays = Number.isFinite(reviewedAtMs)
    ? Math.floor((Date.now() - reviewedAtMs) / (1000 * 60 * 60 * 24))
    : null;
  const reviewOverdue =
    Number.isFinite(reviewAgeDays) && Number.isFinite(maxAgeDays)
      ? reviewAgeDays > maxAgeDays
      : null;

  const valid =
    typeof payload.schemaVersion === 'string' &&
    !!mode &&
    preserveAllArtifacts === true &&
    Number.isFinite(maxAgeDays) &&
    Number.isFinite(reviewAgeDays);

  return {
    path: relPath,
    configured: true,
    valid,
    mode,
    preserveAllArtifacts,
    review: {
      lastReviewedAt,
      maxAgeDays,
      ageDays: Number.isFinite(reviewAgeDays) ? reviewAgeDays : null,
      overdue: reviewOverdue
    }
  };
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
    const formal = parseFormalSummaries(runPath);

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
      fileCount,
      formal
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

function formalStatusCounts(runs) {
  const counts = {};
  for (const run of runs) {
    for (const [tool, result] of Object.entries(run.formal ?? {})) {
      counts[tool] ??= {};
      const status = result.status ?? 'unknown';
      counts[tool][status] = (counts[tool][status] ?? 0) + 1;
    }
  }
  return counts;
}

function buildFormalDelta(latestFormal, previousFormal) {
  const tools = ['csp', 'tla', 'smt', 'alloy'];
  const delta = {};
  for (const tool of tools) {
    const previous = previousFormal?.[tool]?.status ?? null;
    const latest = latestFormal?.[tool]?.status ?? 'unknown';
    delta[tool] = {
      previous,
      latest,
      changed: previous !== null && previous !== latest
    };
  }
  return delta;
}

function buildActionItems(summary) {
  const items = [];
  const latestFormal = summary.latestFormal ?? {};
  const smtFileCount = summary.projectFormalInputs?.smt?.fileCount ?? 0;
  const artifactPolicy = summary.artifactPolicy ?? {};
  if (latestFormal.csp?.status === 'tool_not_available') {
    items.push('CSP: `CSP_RUN_CMD` または FDR/cspx/cspmchecker の実行環境を設定する。');
  }
  if (latestFormal.tla?.status === 'tool_not_available') {
    items.push('TLA+: `TLA_TOOLS_JAR` を設定し TLC 実行可能状態を作る。');
  }
  if (latestFormal.alloy?.status === 'tool_not_available') {
    items.push('Alloy: `ALLOY_JAR` または Alloy CLI を導入する。');
  }
  if (latestFormal.smt?.status === 'file_not_found' || latestFormal.smt?.status === 'no_file') {
    if (smtFileCount > 0) {
      items.push('SMT: `.smt2` は配置済み。`verify:smt` が参照する入力パスを CI で固定する。');
    } else {
      items.push('SMT: 検証対象 `.smt2` ファイルを配置し `verify:smt` 入力を固定する。');
    }
  } else if (latestFormal.smt?.status === 'solver_not_available') {
    items.push('SMT: z3 または cvc5 を実行環境へ導入する。');
  }
  if (summary.runCount >= 20) {
    if (!artifactPolicy.configured) {
      items.push('run数が増加しているため、保持/圧縮方針ファイル（`configs/artifact-retention/policy.json`）を整備する。');
    } else if (!artifactPolicy.valid) {
      items.push('artifact retention policy が不完全です。`schemaVersion/mode/preserveAllArtifacts/review` を補完する。');
    } else if (artifactPolicy.review?.overdue === true) {
      items.push('artifact retention policy のレビュー期限を超過しています。`lastReviewedAt` を更新する。');
    }
  }
  if (items.length === 0) {
    items.push('現時点で優先アクションはありません。');
  }
  return items;
}

function buildSummary(runs) {
  const totalBytes = runs.reduce((acc, run) => acc + run.totalBytes, 0);
  const totalFiles = runs.reduce((acc, run) => acc + run.fileCount, 0);
  const latest = runs[0] ?? null;
  const previous = runs.length > 1 ? runs[1] : null;
  const oldest = runs.length > 0 ? runs[runs.length - 1] : null;
  const projectFormalInputs = collectProjectFormalInputs();
  const artifactPolicy = parseArtifactPolicy();

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
    formalStatusCounts: formalStatusCounts(runs),
    latestFormal: latest?.formal ?? {},
    formalDelta: buildFormalDelta(latest?.formal ?? {}, previous?.formal ?? null),
    projectFormalInputs,
    artifactPolicy,
    actionItems: [],
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
  lines.push('## Formal Status Counts');
  lines.push('');
  lines.push('| tool | status | count |');
  lines.push('| --- | --- | ---: |');
  let formalRowCount = 0;
  for (const [tool, statusMap] of Object.entries(summary.formalStatusCounts ?? {}).sort()) {
    for (const [status, count] of Object.entries(statusMap).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${tool} | ${status} | ${count} |`);
      formalRowCount += 1;
    }
  }
  if (formalRowCount === 0) {
    lines.push('| (none) | (none) | 0 |');
  }

  lines.push('');
  lines.push('## Formal Status Delta (latest vs previous)');
  lines.push('');
  lines.push('| tool | previous | latest | changed |');
  lines.push('| --- | --- | --- | --- |');
  for (const tool of ['csp', 'tla', 'smt', 'alloy']) {
    const row = summary.formalDelta?.[tool] ?? {};
    lines.push(`| ${tool} | ${row.previous ?? '-'} | ${row.latest ?? 'unknown'} | ${row.changed ? 'yes' : 'no'} |`);
  }

  lines.push('');
  lines.push('## Project Formal Inputs');
  lines.push('');
  lines.push(`- smtInputDir: ${summary.projectFormalInputs?.smt?.inputDir ?? '-'}`);
  lines.push(`- smt2Files: ${summary.projectFormalInputs?.smt?.fileCount ?? 0}`);
  for (const filePath of summary.projectFormalInputs?.smt?.files ?? []) {
    lines.push(`- ${filePath}`);
  }

  lines.push('');
  lines.push('## Artifact Retention Policy');
  lines.push('');
  lines.push(`- policyPath: ${summary.artifactPolicy?.path ?? '-'}`);
  lines.push(`- configured: ${summary.artifactPolicy?.configured === true ? 'yes' : 'no'}`);
  lines.push(`- valid: ${summary.artifactPolicy?.valid === true ? 'yes' : 'no'}`);
  lines.push(`- mode: ${summary.artifactPolicy?.mode ?? '-'}`);
  lines.push(`- preserveAllArtifacts: ${summary.artifactPolicy?.preserveAllArtifacts === true ? 'true' : 'false'}`);
  lines.push(`- lastReviewedAt: ${summary.artifactPolicy?.review?.lastReviewedAt ?? '-'}`);
  lines.push(`- reviewMaxAgeDays: ${summary.artifactPolicy?.review?.maxAgeDays ?? '-'}`);
  lines.push(`- reviewOverdue: ${summary.artifactPolicy?.review?.overdue === true ? 'yes' : 'no'}`);

  lines.push('');
  lines.push('## Action Items');
  lines.push('');
  for (const item of summary.actionItems ?? []) {
    lines.push(`- ${item}`);
  }

  lines.push('');
  lines.push(`## Recent Runs (latest ${limit})`);
  lines.push('');
  lines.push('| runFolder | runId | attempt | generatedAt | size | files | sourceSha | formal(csp/tla) |');
  lines.push('| --- | ---: | ---: | --- | ---: | ---: | --- | --- |');
  for (const run of summary.runs.slice(0, limit)) {
    const sourceSha = run.sourceSha ? run.sourceSha.slice(0, 12) : '';
    const cspStatus = run.formal?.csp?.status ?? '-';
    const tlaStatus = run.formal?.tla?.status ?? '-';
    lines.push(
      `| ${run.runFolder} | ${run.runId || '-'} | ${run.runAttempt || '-'} | ${run.generatedAt || '-'} | ${formatBytes(run.totalBytes)} | ${run.fileCount} | ${sourceSha} | csp:${cspStatus}, tla:${tlaStatus} |`
    );
  }

  if (summary.runs.length === 0) {
    lines.push('| (no runs) | - | - | - | 0 B | 0 | - | - |');
  }

  return `${lines.join('\n')}\n`;
}

const runs = parseRunDirectories(runsDir);
const summary = buildSummary(runs);
summary.actionItems = buildActionItems(summary);
const markdown = buildMarkdown(summary, Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 20);

ensureDir(outJsonPath);
ensureDir(outMdPath);
fs.writeFileSync(outJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
fs.writeFileSync(outMdPath, markdown, 'utf8');

console.log(`[generate-run-summary] runs=${summary.runCount}`);
console.log(`[generate-run-summary] json=${path.relative(cwd, outJsonPath)}`);
console.log(`[generate-run-summary] md=${path.relative(cwd, outMdPath)}`);
