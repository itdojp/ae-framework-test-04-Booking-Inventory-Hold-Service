import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const summaryPath = path.resolve(cwd, process.env.IN_SUMMARY ?? 'reports/ae-framework-runs-summary.json');
const outJsonPath = path.resolve(cwd, process.env.OUT_JSON ?? 'reports/evaluation-threshold-alert.json');
const uniqueKey = process.env.ISSUE_UNIQUE_KEY ?? '[evaluation-threshold-alert]';
const issueTitleBase = process.env.ISSUE_TITLE_BASE ?? 'ae-framework evaluation threshold breached';

const ratingRank = {
  C: 0,
  B: 1,
  A: 2
};

const minRunCount = toFiniteNumber(process.env.MIN_RUN_COUNT, 1);
const minScore = toFiniteNumber(process.env.MIN_SCORE, 90);
const minFormalReady = toFiniteNumber(process.env.MIN_FORMAL_READY, 4);
const minFormalHealthy = toFiniteNumber(process.env.MIN_FORMAL_HEALTHY, 4);
const minRating = normalizeRating(process.env.MIN_RATING ?? 'A') ?? 'A';

const requirePolicyValid = toBoolean(process.env.REQUIRE_POLICY_VALID, true);
const requirePreserveAllArtifacts = toBoolean(process.env.REQUIRE_PRESERVE_ALL_ARTIFACTS, true);
const requireReviewNotOverdue = toBoolean(process.env.REQUIRE_REVIEW_NOT_OVERDUE, true);

const tools = ['csp', 'tla', 'smt', 'alloy'];
const notReadyStatuses = new Set(['tool_not_available', 'file_not_found', 'solver_not_available', 'no_file', 'unknown']);
const healthyStatuses = new Set(['ran', 'passed']);

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

function toBoolean(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeRating(value) {
  const rating = String(value ?? '').trim().toUpperCase();
  if (Object.hasOwn(ratingRank, rating)) return rating;
  return null;
}

function scoreFormal(latestFormal) {
  let ready = 0;
  let healthy = 0;

  for (const tool of tools) {
    const result = latestFormal?.[tool] ?? {};
    const status = typeof result.status === 'string' ? result.status : 'unknown';
    if (!notReadyStatuses.has(status)) {
      ready += 1;
    }
    if (healthyStatuses.has(status) && result.ok !== false) {
      healthy += 1;
    }
  }

  return {
    ready,
    healthy,
    total: tools.length
  };
}

function evaluate(summary) {
  const runCount = Number(summary.runCount ?? 0);
  const workflowCount = Number(summary.workflowCounts?.['ae-framework-autopilot'] ?? 0);
  const formal = scoreFormal(summary.latestFormal ?? {});
  const latestRun = summary.latestRun ?? {};
  const artifactPolicy = summary.artifactPolicy ?? {};

  let score = 0;
  if (runCount > 0) score += 30;
  if (workflowCount > 0) score += 20;
  score += Math.round((formal.ready / formal.total) * 50);

  let rating = 'C';
  if (score >= 85) rating = 'A';
  else if (score >= 70) rating = 'B';

  return {
    score,
    rating,
    runCount,
    workflowCount,
    formal,
    latestRun: {
      runId: String(latestRun.runId ?? ''),
      runAttempt: String(latestRun.runAttempt ?? ''),
      generatedAt: typeof latestRun.generatedAt === 'string' ? latestRun.generatedAt : null
    },
    artifactPolicy: {
      configured: artifactPolicy.configured === true,
      valid: artifactPolicy.valid === true,
      preserveAllArtifacts: artifactPolicy.preserveAllArtifacts === true,
      reviewOverdue: artifactPolicy.review?.overdue === true
    }
  };
}

function detectBreaches(result) {
  const breaches = [];
  if (result.runCount < minRunCount) {
    breaches.push({
      key: 'run_count',
      expected: `>= ${minRunCount}`,
      actual: String(result.runCount),
      message: `runCount が閾値未満です。`
    });
  }
  if (result.score < minScore) {
    breaches.push({
      key: 'score',
      expected: `>= ${minScore}`,
      actual: String(result.score),
      message: `evaluation score が閾値未満です。`
    });
  }

  const actualRatingRank = ratingRank[result.rating] ?? -1;
  const minRatingRank = ratingRank[minRating] ?? ratingRank.A;
  if (actualRatingRank < minRatingRank) {
    breaches.push({
      key: 'rating',
      expected: minRating,
      actual: result.rating,
      message: `evaluation rating が閾値未満です。`
    });
  }
  if (result.formal.ready < minFormalReady) {
    breaches.push({
      key: 'formal_ready',
      expected: `>= ${minFormalReady}`,
      actual: String(result.formal.ready),
      message: `formal ready tool 数が閾値未満です。`
    });
  }
  if (result.formal.healthy < minFormalHealthy) {
    breaches.push({
      key: 'formal_healthy',
      expected: `>= ${minFormalHealthy}`,
      actual: String(result.formal.healthy),
      message: `formal healthy tool 数が閾値未満です。`
    });
  }
  if (requirePolicyValid && !result.artifactPolicy.valid) {
    breaches.push({
      key: 'artifact_policy_valid',
      expected: 'true',
      actual: String(result.artifactPolicy.valid),
      message: `artifact retention policy が有効状態ではありません。`
    });
  }
  if (requirePreserveAllArtifacts && !result.artifactPolicy.preserveAllArtifacts) {
    breaches.push({
      key: 'preserve_all_artifacts',
      expected: 'true',
      actual: String(result.artifactPolicy.preserveAllArtifacts),
      message: `preserveAllArtifacts が true ではありません。`
    });
  }
  if (requireReviewNotOverdue && result.artifactPolicy.reviewOverdue) {
    breaches.push({
      key: 'review_overdue',
      expected: 'false',
      actual: 'true',
      message: `artifact retention policy review が期限超過です。`
    });
  }
  return breaches;
}

function buildIssueBody(result, breaches, nowIso) {
  const lines = [];
  lines.push('## ae-framework Evaluation Threshold Breach');
  lines.push('');
  lines.push('Latest ae-framework evaluation metrics are below configured thresholds.');
  lines.push('');
  lines.push(`- detectedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push(`- latestRunId: ${result.latestRun.runId || '-'}`);
  lines.push(`- latestRunAttempt: ${result.latestRun.runAttempt || '-'}`);
  lines.push(`- latestRunGeneratedAt: ${result.latestRun.generatedAt ?? '-'}`);
  lines.push(`- runCount: ${result.runCount}`);
  lines.push(`- score: ${result.score}`);
  lines.push(`- rating: ${result.rating}`);
  lines.push(`- formalReady: ${result.formal.ready} / ${result.formal.total}`);
  lines.push(`- formalHealthy: ${result.formal.healthy} / ${result.formal.total}`);
  lines.push('');
  lines.push('### Thresholds');
  lines.push('');
  lines.push(`- minRunCount: ${minRunCount}`);
  lines.push(`- minScore: ${minScore}`);
  lines.push(`- minRating: ${minRating}`);
  lines.push(`- minFormalReady: ${minFormalReady}`);
  lines.push(`- minFormalHealthy: ${minFormalHealthy}`);
  lines.push(`- requirePolicyValid: ${requirePolicyValid ? 'true' : 'false'}`);
  lines.push(`- requirePreserveAllArtifacts: ${requirePreserveAllArtifacts ? 'true' : 'false'}`);
  lines.push(`- requireReviewNotOverdue: ${requireReviewNotOverdue ? 'true' : 'false'}`);
  lines.push('');
  lines.push('### Breaches');
  lines.push('');
  for (const breach of breaches) {
    lines.push(`- ${breach.key}: expected ${breach.expected}, actual ${breach.actual}`);
  }
  lines.push('');
  lines.push('### Required Action');
  lines.push('');
  lines.push('1. Inspect latest run artifacts and evaluation report for root cause.');
  lines.push('2. Restore formal verification health and/or evaluation score.');
  lines.push('3. Re-run autopilot and confirm thresholds are satisfied.');
  lines.push('');
  lines.push('### Tracking Key');
  lines.push('');
  lines.push(`- uniqueKey: ${uniqueKey}`);
  lines.push(`<!-- evaluation-threshold-alert-key: ${uniqueKey} -->`);
  return `${lines.join('\n')}\n`;
}

function buildResolveComment(nowIso) {
  const lines = [];
  lines.push('ae-framework evaluation is back within configured thresholds.');
  lines.push('');
  lines.push(`- resolvedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push('Auto-closing this tracking issue.');
  return `${lines.join('\n')}\n`;
}

if (!fs.existsSync(summaryPath)) {
  console.error(`[generate-evaluation-threshold-alert] summary not found: ${summaryPath}`);
  process.exit(1);
}

let summary;
try {
  summary = readJson(summaryPath);
} catch (error) {
  console.error(`[generate-evaluation-threshold-alert] failed to read summary: ${error.message}`);
  process.exit(1);
}

if (!summary || typeof summary !== 'object') {
  console.error('[generate-evaluation-threshold-alert] summary is invalid');
  process.exit(1);
}

const nowIso = new Date().toISOString();
const result = evaluate(summary);
const breaches = detectBreaches(result);
const shouldOpen = breaches.length > 0;
const reason = shouldOpen ? 'threshold_breached' : 'within_threshold';

const payload = {
  generatedAt: nowIso,
  summaryPath: path.relative(cwd, summaryPath),
  thresholds: {
    minRunCount,
    minScore,
    minRating,
    minFormalReady,
    minFormalHealthy,
    requirePolicyValid,
    requirePreserveAllArtifacts,
    requireReviewNotOverdue
  },
  evaluation: result,
  breaches,
  issue: {
    uniqueKey,
    title: `${uniqueKey} ${issueTitleBase}`,
    shouldOpen,
    reason,
    body: shouldOpen ? buildIssueBody(result, breaches, nowIso) : null,
    closeComment: buildResolveComment(nowIso)
  }
};

ensureDir(outJsonPath);
fs.writeFileSync(outJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[generate-evaluation-threshold-alert] shouldOpen=${payload.issue.shouldOpen ? 'yes' : 'no'}`);
console.log(`[generate-evaluation-threshold-alert] reason=${payload.issue.reason}`);
console.log(`[generate-evaluation-threshold-alert] json=${path.relative(cwd, outJsonPath)}`);
