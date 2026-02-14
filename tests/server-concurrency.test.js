import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('concurrency: 同一 hold への同時 confirm は二重生成しない', async () => {
  const port = 4050 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-concurrency-confirm-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const resourceRes = await fetch(`${server.baseUrl}/api/v1/resources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Room-C',
        timezone: 'UTC',
        slot_granularity_minutes: 15,
        min_duration_minutes: 15,
        max_duration_minutes: 240
      })
    });
    assert.equal(resourceRes.status, 201);
    const resource = await resourceRes.json();

    const holdRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        created_by_user_id: 'U1',
        expires_in_seconds: 600,
        lines: [
          {
            kind: 'RESOURCE_SLOT',
            resource_id: resource.resource_id,
            start_at: '2026-02-15T10:00:00Z',
            end_at: '2026-02-15T11:00:00Z'
          }
        ]
      })
    });
    assert.equal(holdRes.status, 201);
    const hold = await holdRes.json();

    const [c1, c2] = await Promise.all([
      fetch(`${server.baseUrl}/api/v1/holds/${hold.hold_id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      }),
      fetch(`${server.baseUrl}/api/v1/holds/${hold.hold_id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      })
    ]);

    assert.equal(c1.status, 200);
    assert.equal(c2.status, 200);
    const body1 = await c1.json();
    const body2 = await c2.json();
    assert.equal(body1.bookings.length, 1);
    assert.equal(body2.bookings.length, 1);
    assert.equal(body1.bookings[0].booking_id, body2.bookings[0].booking_id);

    const listRes = await fetch(`${server.baseUrl}/api/v1/bookings?resource_id=${resource.resource_id}`);
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.equal(list.length, 1);
  } finally {
    await server.stop();
  }
});

test('concurrency: 在庫5に対する同時 hold(4) と hold(2) は片方が 409', async () => {
  const port = 4200 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-concurrency-hold-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Concurrency Item',
        total_quantity: 5
      })
    });
    assert.equal(itemRes.status, 201);
    const item = await itemRes.json();

    const [h1, h2] = await Promise.all([
      fetch(`${server.baseUrl}/api/v1/holds`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'T1',
          created_by_user_id: 'U1',
          expires_in_seconds: 600,
          lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 4 }]
        })
      }),
      fetch(`${server.baseUrl}/api/v1/holds`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'T1',
          created_by_user_id: 'U2',
          expires_in_seconds: 600,
          lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 2 }]
        })
      })
    ]);

    const statuses = [h1.status, h2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409]);
  } finally {
    await server.stop();
  }
});
