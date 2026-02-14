import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('server patch: resource/item 更新と制約チェック', async () => {
  const port = 3950 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-patch-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const resourceRes = await fetch(`${server.baseUrl}/api/v1/resources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Room-Patch',
        timezone: 'UTC',
        slot_granularity_minutes: 15,
        min_duration_minutes: 15,
        max_duration_minutes: 240
      })
    });
    assert.equal(resourceRes.status, 201);
    const resource = await resourceRes.json();

    const patchResourceRes = await fetch(`${server.baseUrl}/api/v1/resources/${resource.resource_id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slot_granularity_minutes: 30,
        min_duration_minutes: 30,
        max_duration_minutes: 90
      })
    });
    assert.equal(patchResourceRes.status, 200);

    const availabilityRes = await fetch(
      `${server.baseUrl}/api/v1/resources/${resource.resource_id}/availability?start_at=2026-02-14T10:00:00Z&end_at=2026-02-14T11:00:00Z`
    );
    assert.equal(availabilityRes.status, 200);
    const availability = await availabilityRes.json();
    assert.equal(availability.slots.length, 2);

    const misalignedHoldRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
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
            start_at: '2026-02-14T10:15:00Z',
            end_at: '2026-02-14T10:45:00Z'
          }
        ]
      })
    });
    assert.equal(misalignedHoldRes.status, 400);
    const misalignedError = await misalignedHoldRes.json();
    assert.equal(misalignedError.error.code, 'INVALID_RESOURCE_SLOT_ALIGNMENT');

    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Patch',
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
        lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 4 }]
      })
    });
    assert.equal(holdRes.status, 201);

    const lowQuantityPatchRes = await fetch(`${server.baseUrl}/api/v1/items/${item.item_id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ total_quantity: 3 })
    });
    assert.equal(lowQuantityPatchRes.status, 409);
    const lowQuantityPatchBody = await lowQuantityPatchRes.json();
    assert.equal(lowQuantityPatchBody.error.code, 'ITEM_QUANTITY_CONFLICT');

    const okQuantityPatchRes = await fetch(`${server.baseUrl}/api/v1/items/${item.item_id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ total_quantity: 4 })
    });
    assert.equal(okQuantityPatchRes.status, 200);
    const patchedItem = await okQuantityPatchRes.json();
    assert.equal(patchedItem.total_quantity, 4);
  } finally {
    await server.stop();
  }
});

test('server hold create: Idempotency-Key header で同一 hold を返す', async () => {
  const port = 4050 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-idempotency-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Idempotency',
        total_quantity: 5
      })
    });
    assert.equal(itemRes.status, 201);
    const item = await itemRes.json();

    const body = {
      tenant_id: 'T1',
      created_by_user_id: 'U1',
      expires_in_seconds: 600,
      lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 1 }]
    };
    const headers = {
      'content-type': 'application/json',
      'idempotency-key': 'same-key-001'
    };

    const firstRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const secondRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    assert.equal(firstRes.status, 201);
    assert.equal(secondRes.status, 201);

    const first = await firstRes.json();
    const second = await secondRes.json();
    assert.equal(first.hold_id, second.hold_id);
  } finally {
    await server.stop();
  }
});
