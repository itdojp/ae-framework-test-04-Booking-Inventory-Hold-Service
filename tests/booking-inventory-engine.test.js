import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingInventoryEngine } from '../src/index.js';
import { DomainError } from '../src/domain/errors.js';

function at(iso) {
  return new Date(iso);
}

function assertDomainError(error, code) {
  assert.ok(error instanceof DomainError);
  assert.equal(error.code, code);
}

test('BI-ACC-01: 同一時間枠の重複確定を防止する', () => {
  const engine = new BookingInventoryEngine();
  const tenantId = 'T1';
  const userId = 'U1';
  const resource = engine.createResource({
    tenant_id: tenantId,
    name: 'Room-1',
    timezone: 'UTC',
    slot_granularity_minutes: 15,
    min_duration_minutes: 15,
    max_duration_minutes: 240
  });

  const hold1 = engine.createHold({
    tenant_id: tenantId,
    created_by_user_id: userId,
    expires_in_seconds: 600,
    now: at('2026-02-14T10:00:00Z'),
    lines: [
      {
        kind: 'RESOURCE_SLOT',
        resource_id: resource.resource_id,
        start_at: '2026-02-14T11:00:00Z',
        end_at: '2026-02-14T12:00:00Z'
      }
    ]
  });

  assert.throws(
    () =>
      engine.createHold({
        tenant_id: tenantId,
        created_by_user_id: 'U2',
        expires_in_seconds: 600,
        now: at('2026-02-14T10:00:10Z'),
        lines: [
          {
            kind: 'RESOURCE_SLOT',
            resource_id: resource.resource_id,
            start_at: '2026-02-14T11:00:00Z',
            end_at: '2026-02-14T12:00:00Z'
          }
        ]
      }),
    (error) => {
      assertDomainError(error, 'RESOURCE_CONFLICT');
      return true;
    }
  );

  const confirmed = engine.confirmHold({
    hold_id: hold1.hold_id,
    now: at('2026-02-14T10:01:00Z')
  });
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(confirmed.bookings.length, 1);
});

test('BI-ACC-02: 在庫5に対して hold(4) と hold(2) は片方が失敗する', () => {
  const engine = new BookingInventoryEngine();
  const tenantId = 'T1';
  const userId = 'U1';
  const item = engine.createItem({
    tenant_id: tenantId,
    name: 'Projector',
    total_quantity: 5
  });

  const holdA = engine.createHold({
    tenant_id: tenantId,
    created_by_user_id: userId,
    expires_in_seconds: 600,
    now: at('2026-02-14T10:00:00Z'),
    lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 4 }]
  });

  assert.throws(
    () =>
      engine.createHold({
        tenant_id: tenantId,
        created_by_user_id: 'U2',
        expires_in_seconds: 600,
        now: at('2026-02-14T10:00:10Z'),
        lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 2 }]
      }),
    (error) => {
      assertDomainError(error, 'INSUFFICIENT_INVENTORY');
      return true;
    }
  );

  const confirmed = engine.confirmHold({
    hold_id: holdA.hold_id,
    now: at('2026-02-14T10:01:00Z')
  });
  assert.equal(confirmed.reservations.length, 1);
  assert.equal(confirmed.reservations[0].quantity, 4);
});

test('BI-ACC-03: 期限切れ hold は confirm できない', () => {
  const engine = new BookingInventoryEngine();
  const tenantId = 'T1';
  const userId = 'U1';
  const item = engine.createItem({
    tenant_id: tenantId,
    name: 'Tablet',
    total_quantity: 10
  });

  const hold = engine.createHold({
    tenant_id: tenantId,
    created_by_user_id: userId,
    expires_in_seconds: 60,
    now: at('2026-02-14T10:00:00Z'),
    lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 1 }]
  });

  assert.throws(
    () =>
      engine.confirmHold({
        hold_id: hold.hold_id,
        now: at('2026-02-14T10:01:00Z')
      }),
    (error) => {
      assertDomainError(error, 'HOLD_EXPIRED');
      return true;
    }
  );

  const current = engine.getHold(hold.hold_id);
  assert.equal(current.status, 'EXPIRED');
});

test('BI-ACC-04: Expire バッチ後に期限切れ hold は可用性へ影響しない', () => {
  const engine = new BookingInventoryEngine();
  const tenantId = 'T1';
  const userId = 'U1';
  const item = engine.createItem({
    tenant_id: tenantId,
    name: 'Monitor',
    total_quantity: 5
  });

  engine.createHold({
    tenant_id: tenantId,
    created_by_user_id: userId,
    expires_in_seconds: 60,
    now: at('2026-02-14T10:00:00Z'),
    lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 3 }]
  });

  const before = engine.getItemAvailability(item.item_id);
  assert.equal(before.available_quantity, 2);

  const expired = engine.expireHolds({ now: at('2026-02-14T10:01:01Z') });
  assert.equal(expired, 1);

  const after = engine.getItemAvailability(item.item_id);
  assert.equal(after.available_quantity, 5);
});
