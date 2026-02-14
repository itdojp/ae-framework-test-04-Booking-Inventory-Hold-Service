import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingInventoryEngine } from '../src/index.js';

test('snapshot: export -> import で状態を復元できる', () => {
  const engine = new BookingInventoryEngine();
  const item = engine.createItem({
    tenant_id: 'T1',
    name: 'Tablet',
    total_quantity: 5
  });
  const hold = engine.createHold({
    tenant_id: 'T1',
    created_by_user_id: 'U1',
    expires_in_seconds: 600,
    lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 2 }]
  });
  engine.confirmHold({ hold_id: hold.hold_id });

  const snapshot = engine.toSnapshot();
  const restored = new BookingInventoryEngine({ snapshot });

  const availability = restored.getItemAvailability(item.item_id);
  assert.equal(availability.available_quantity, 3);

  const reservations = restored.listReservations({ item_id: item.item_id });
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, 'CONFIRMED');

  const nextItem = restored.createItem({
    tenant_id: 'T1',
    name: 'Laptop',
    total_quantity: 2
  });
  assert.equal(nextItem.item_id, 'I2');
});
