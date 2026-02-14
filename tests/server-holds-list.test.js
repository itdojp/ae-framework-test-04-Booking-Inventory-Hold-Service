import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

async function createItem(baseUrl, { tenant_id, name, total_quantity }) {
  const res = await fetch(`${baseUrl}/api/v1/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant_id, name, total_quantity })
  });
  assert.equal(res.status, 201);
  return res.json();
}

async function createHold(baseUrl, { tenant_id, created_by_user_id, item_id, quantity }) {
  const res = await fetch(`${baseUrl}/api/v1/holds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenant_id,
      created_by_user_id,
      expires_in_seconds: 600,
      lines: [{ kind: 'INVENTORY_QTY', item_id, quantity }]
    })
  });
  assert.equal(res.status, 201);
  return res.json();
}

test('server holds list: tenant/status/filter を適用できる', async () => {
  const port = 4800 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-holds-list-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemT1 = await createItem(server.baseUrl, {
      tenant_id: 'T1',
      name: 'Item-Holds-T1',
      total_quantity: 5
    });
    const itemT2 = await createItem(server.baseUrl, {
      tenant_id: 'T2',
      name: 'Item-Holds-T2',
      total_quantity: 3
    });

    const hold1 = await createHold(server.baseUrl, {
      tenant_id: 'T1',
      created_by_user_id: 'U1',
      item_id: itemT1.item_id,
      quantity: 1
    });
    await createHold(server.baseUrl, {
      tenant_id: 'T1',
      created_by_user_id: 'U2',
      item_id: itemT1.item_id,
      quantity: 1
    });
    await createHold(server.baseUrl, {
      tenant_id: 'T2',
      created_by_user_id: 'U9',
      item_id: itemT2.item_id,
      quantity: 1
    });

    const cancelRes = await fetch(`${server.baseUrl}/api/v1/holds/${hold1.hold_id}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor_user_id: 'U1' })
    });
    assert.equal(cancelRes.status, 200);

    const cancelledListRes = await fetch(`${server.baseUrl}/api/v1/holds?status=CANCELLED`, {
      headers: { 'x-tenant-id': 'T1' }
    });
    assert.equal(cancelledListRes.status, 200);
    const cancelledHolds = await cancelledListRes.json();
    assert.equal(cancelledHolds.length, 1);
    assert.equal(cancelledHolds[0].hold_id, hold1.hold_id);
    assert.equal(cancelledHolds[0].tenant_id, 'T1');

    const crossTenantRes = await fetch(`${server.baseUrl}/api/v1/holds?tenant_id=T2`, {
      headers: { 'x-tenant-id': 'T1' }
    });
    assert.equal(crossTenantRes.status, 403);

    const invalidQueryRes = await fetch(`${server.baseUrl}/api/v1/holds?status=UNKNOWN`);
    assert.equal(invalidQueryRes.status, 400);
  } finally {
    await server.stop();
  }
});

test('server holds list: role context では MEMBER/VIEWER は自分の hold のみ取得', async () => {
  const port = 4900 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-holds-role-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const item = await createItem(server.baseUrl, {
      tenant_id: 'T1',
      name: 'Item-Holds-Role',
      total_quantity: 5
    });
    const holdU1 = await createHold(server.baseUrl, {
      tenant_id: 'T1',
      created_by_user_id: 'U1',
      item_id: item.item_id,
      quantity: 1
    });
    const holdU2 = await createHold(server.baseUrl, {
      tenant_id: 'T1',
      created_by_user_id: 'U2',
      item_id: item.item_id,
      quantity: 1
    });

    const memberListRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      headers: {
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U1'
      }
    });
    assert.equal(memberListRes.status, 200);
    const memberHolds = await memberListRes.json();
    assert.equal(memberHolds.length, 1);
    assert.equal(memberHolds[0].hold_id, holdU1.hold_id);

    const viewerListRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      headers: {
        'x-tenant-id': 'T1',
        'x-user-role': 'VIEWER',
        'x-user-id': 'U2'
      }
    });
    assert.equal(viewerListRes.status, 200);
    const viewerHolds = await viewerListRes.json();
    assert.equal(viewerHolds.length, 1);
    assert.equal(viewerHolds[0].hold_id, holdU2.hold_id);

    const memberMismatchRes = await fetch(`${server.baseUrl}/api/v1/holds?created_by_user_id=U2`, {
      headers: {
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U1'
      }
    });
    assert.equal(memberMismatchRes.status, 403);

    const adminListRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      headers: {
        'x-tenant-id': 'T1',
        'x-user-role': 'ADMIN'
      }
    });
    assert.equal(adminListRes.status, 200);
    const adminHolds = await adminListRes.json();
    assert.equal(adminHolds.length, 2);
  } finally {
    await server.stop();
  }
});
