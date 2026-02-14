import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('server audit logs: hold 操作の監査ログを取得できる', async () => {
  const port = 4150 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-audit-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Audit',
        total_quantity: 5
      })
    });
    assert.equal(itemRes.status, 201);
    const item = await itemRes.json();

    const holdRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        created_by_user_id: 'U1',
        expires_in_seconds: 600,
        lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 2 }]
      })
    });
    assert.equal(holdRes.status, 201);
    const hold = await holdRes.json();

    const confirmRes = await fetch(`${server.baseUrl}/api/v1/holds/${hold.hold_id}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(confirmRes.status, 200);

    const auditRes = await fetch(
      `${server.baseUrl}/api/v1/audit-logs?target_type=HOLD&target_id=${hold.hold_id}`
    );
    assert.equal(auditRes.status, 200);
    const audits = await auditRes.json();
    assert.ok(Array.isArray(audits));
    assert.ok(audits.length >= 2);
    const actions = new Set(audits.map((a) => a.action));
    assert.equal(actions.has('HOLD_CREATE'), true);
    assert.equal(actions.has('HOLD_CONFIRM'), true);

    const limitedAuditRes = await fetch(
      `${server.baseUrl}/api/v1/audit-logs?target_type=HOLD&target_id=${hold.hold_id}&limit=1`
    );
    assert.equal(limitedAuditRes.status, 200);
    const limited = await limitedAuditRes.json();
    assert.equal(limited.length, 1);
  } finally {
    await server.stop();
  }
});

test('server audit logs: 不正クエリは 400', async () => {
  const port = 4250 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-audit-invalid-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });
  try {
    const invalidLimitRes = await fetch(`${server.baseUrl}/api/v1/audit-logs?limit=0`);
    assert.equal(invalidLimitRes.status, 400);

    const invalidRangeRes = await fetch(
      `${server.baseUrl}/api/v1/audit-logs?from_at=2026-02-14T12:00:00Z&to_at=2026-02-14T11:00:00Z`
    );
    assert.equal(invalidRangeRes.status, 400);
  } finally {
    await server.stop();
  }
});
