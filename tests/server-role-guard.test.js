import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('server role guard: MEMBER は管理操作を実行できない', async () => {
  const port = 4300 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-role-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const memberCreateItemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER'
      },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Role',
        total_quantity: 5
      })
    });
    assert.equal(memberCreateItemRes.status, 403);

    const adminCreateItemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'ADMIN'
      },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Role-Admin',
        total_quantity: 5
      })
    });
    assert.equal(adminCreateItemRes.status, 201);
    const item = await adminCreateItemRes.json();

    const memberPatchItemRes = await fetch(`${server.baseUrl}/api/v1/items/${item.item_id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER'
      },
      body: JSON.stringify({ total_quantity: 4 })
    });
    assert.equal(memberPatchItemRes.status, 403);

    const memberExpireRes = await fetch(`${server.baseUrl}/api/v1/system/expire`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-role': 'MEMBER'
      },
      body: JSON.stringify({})
    });
    assert.equal(memberExpireRes.status, 403);
  } finally {
    await server.stop();
  }
});

test('server actor resolution: x-user-id を cancel actor に補完できる', async () => {
  const port = 4400 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-actor-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Actor',
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
        lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 1 }]
      })
    });
    assert.equal(holdRes.status, 201);
    const hold = await holdRes.json();

    const cancelRes = await fetch(`${server.baseUrl}/api/v1/holds/${hold.hold_id}/cancel`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-id': 'U1'
      },
      body: JSON.stringify({})
    });
    assert.equal(cancelRes.status, 200);
    const cancelled = await cancelRes.json();
    assert.equal(cancelled.status, 'CANCELLED');
  } finally {
    await server.stop();
  }
});
