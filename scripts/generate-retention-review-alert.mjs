import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const summaryPath = path.resolve(cwd, process.env.IN_SUMMARY ?? 'reports/ae-framework-runs-summary.json');
const outJsonPath = path.resolve(cwd, process.env.OUT_JSON ?? 'reports/artifact-retention-review-alert.json');
const uniqueKey = process.env.ISSUE_UNIQUE_KEY ?? '[artifact-retention-review]';
const issueTitleBase = process.env.ISSUE_TITLE_BASE ?? 'Artifact retention policy review overdue';

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function asFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildOverdueBody(summary, policy, nowIso) {
  const lines = [];
  lines.push('## Artifact Retention Review Overdue');
  lines.push('');
  lines.push('Artifact retention policy review has exceeded the configured max age.');
  lines.push('');
  lines.push(`- detectedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push(`- policyPath: ${policy.path ?? '-'}`);
  lines.push(`- mode: ${policy.mode ?? '-'}`);
  lines.push(`- preserveAllArtifacts: ${policy.preserveAllArtifacts === true ? 'true' : 'false'}`);
  lines.push(`- lastReviewedAt: ${policy.review?.lastReviewedAt ?? '-'}`);
  lines.push(`- reviewAgeDays: ${policy.review?.ageDays ?? '-'}`);
  lines.push(`- reviewMaxAgeDays: ${policy.review?.maxAgeDays ?? '-'}`);
  lines.push(`- runCount: ${summary.runCount ?? '-'}`);
  lines.push('');
  lines.push('### Required Action');
  lines.push('');
  lines.push('1. Confirm current artifact retention strategy is still valid.');
  lines.push('2. Update `configs/artifact-retention/policy.json` `review.lastReviewedAt`.');
  lines.push('3. Commit the policy update and let autopilot regenerate reports.');
  lines.push('');
  lines.push('### Tracking Key');
  lines.push('');
  lines.push(`- uniqueKey: ${uniqueKey}`);
  lines.push(`<!-- artifact-retention-review-key: ${uniqueKey} -->`);
  return `${lines.join('\n')}\n`;
}

function buildResolveComment(nowIso) {
  const lines = [];
  lines.push('Artifact retention policy review is no longer overdue.');
  lines.push('');
  lines.push(`- resolvedAt: ${nowIso}`);
  lines.push(`- summaryPath: ${path.relative(cwd, summaryPath)}`);
  lines.push('Auto-closing this tracking issue.');
  return `${lines.join('\n')}\n`;
}

if (!fs.existsSync(summaryPath)) {
  console.error(`[generate-retention-review-alert] summary not found: ${summaryPath}`);
  process.exit(1);
}

let summary;
try {
  summary = readJson(summaryPath);
} catch (error) {
  console.error(`[generate-retention-review-alert] failed to read summary: ${error.message}`);
  process.exit(1);
}

if (!summary || typeof summary !== 'object') {
  console.error('[generate-retention-review-alert] summary is invalid');
  process.exit(1);
}

const policy = summary.artifactPolicy ?? {};
const review = policy.review ?? {};

const configured = policy.configured === true;
const valid = policy.valid === true;
const overdue = review.overdue === true;
const shouldOpen = configured && valid && overdue;
const nowIso = new Date().toISOString();

let reason = 'review_ok';
if (!configured) {
  reason = 'policy_not_configured';
} else if (!valid) {
  reason = 'policy_invalid';
} else if (overdue) {
  reason = 'review_overdue';
}

const payload = {
  generatedAt: nowIso,
  summaryPath: path.relative(cwd, summaryPath),
  issue: {
    uniqueKey,
    title: `${uniqueKey} ${issueTitleBase}`,
    shouldOpen,
    reason,
    body: shouldOpen ? buildOverdueBody(summary, policy, nowIso) : null,
    closeComment: buildResolveComment(nowIso)
  },
  policy: {
    path: policy.path ?? null,
    configured,
    valid,
    mode: typeof policy.mode === 'string' ? policy.mode : null,
    preserveAllArtifacts: policy.preserveAllArtifacts === true,
    review: {
      lastReviewedAt: typeof review.lastReviewedAt === 'string' ? review.lastReviewedAt : null,
      maxAgeDays: asFiniteNumber(review.maxAgeDays),
      ageDays: asFiniteNumber(review.ageDays),
      overdue
    }
  }
};

ensureDir(outJsonPath);
fs.writeFileSync(outJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[generate-retention-review-alert] shouldOpen=${payload.issue.shouldOpen ? 'yes' : 'no'}`);
console.log(`[generate-retention-review-alert] reason=${payload.issue.reason}`);
console.log(`[generate-retention-review-alert] json=${path.relative(cwd, outJsonPath)}`);
