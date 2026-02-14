import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BookingInventoryEngine } from '../src/domain/booking-inventory-engine.js';
import { JsonStateStore } from '../src/infra/json-state-store.js';

test('expire-holds script: 期限切れ hold を EXPIRED に更新する', () => {
  const stateFile = path.join(os.tmpdir(), `bi-expire-script-${process.pid}-${Date.now()}.json`);
  const store = new JsonStateStore(stateFile);
  const engine = new BookingInventoryEngine();
  const item = engine.createItem({
    tenant_id: 'T1',
    name: 'Batch Item',
    total_quantity: 2
  });

  const hold = engine.createHold({
    tenant_id: 'T1',
    created_by_user_id: 'U1',
    expires_in_seconds: 60,
    now: new Date('2026-02-14T10:00:00Z'),
    lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 1 }]
  });
  store.save(engine.toSnapshot());

  const result = spawnSync('node', ['scripts/expire-holds.mjs', '--now', '2026-02-14T10:02:00Z'], {
    cwd: path.resolve('.'),
    env: { ...process.env, STATE_FILE: stateFile },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.expired, 1);

  const updated = new BookingInventoryEngine({ snapshot: store.load() });
  const reloadedHold = updated.getHold(hold.hold_id);
  assert.equal(reloadedHold.status, 'EXPIRED');
  for (const line of reloadedHold.lines) {
    assert.equal(line.status, 'RELEASED');
  }
});
