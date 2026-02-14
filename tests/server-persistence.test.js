import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('server persistence: 再起動後に hold 状態を復元できる', async () => {
  const stateFile = path.join(os.tmpdir(), `bi-state-${process.pid}-${Date.now()}.json`);
  const port1 = 3700 + Math.floor(Math.random() * 100);
  const first = await startServer({ port: port1, stateFile });
  let holdId;

  try {
    const itemRes = await fetch(`${first.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Persisted Item',
        total_quantity: 4
      })
    });
    assert.equal(itemRes.status, 201);
    const item = await itemRes.json();

    const holdRes = await fetch(`${first.baseUrl}/api/v1/holds`, {
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
    holdId = hold.hold_id;
  } finally {
    await first.stop();
  }

  const second = await startServer({ port: port1 + 1, stateFile });
  try {
    const holdGet = await fetch(`${second.baseUrl}/api/v1/holds/${holdId}`);
    assert.equal(holdGet.status, 200);
    const hold = await holdGet.json();
    assert.equal(hold.hold_id, holdId);
    assert.equal(hold.status, 'ACTIVE');
  } finally {
    await second.stop();
  }
});
