import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingInventoryEngine } from '../src/index.js';
import { DomainError } from '../src/domain/errors.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function overlap(a, b) {
  const aS = new Date(a.start_at).getTime();
  const aE = new Date(a.end_at).getTime();
  const bS = new Date(b.start_at).getTime();
  const bE = new Date(b.end_at).getTime();
  return aS < bE && bS < aE;
}

function assertInvariants(engine, itemId) {
  const availability = engine.getItemAvailability(itemId);
  assert.ok(availability.available_quantity >= 0, 'available_quantity must be >= 0');

  for (const hold of engine.holds.values()) {
    if (hold.status === 'CANCELLED' || hold.status === 'EXPIRED') {
      for (const line of hold.lines) {
        assert.equal(line.status, 'RELEASED', 'terminal hold lines must be released');
      }
    }
    if (hold.status === 'CONFIRMED') {
      const hasBooking = Array.from(engine.bookings.values()).some((b) => b.source_hold_id === hold.hold_id);
      const hasReservation = Array.from(engine.reservations.values()).some(
        (r) => r.source_hold_id === hold.hold_id
      );
      assert.ok(hasBooking || hasReservation, 'confirmed hold must produce artifacts');
    }
  }

  const confirmedBookings = Array.from(engine.bookings.values()).filter((b) => b.status === 'CONFIRMED');
  for (let i = 0; i < confirmedBookings.length; i += 1) {
    for (let j = i + 1; j < confirmedBookings.length; j += 1) {
      const a = confirmedBookings[i];
      const b = confirmedBookings[j];
      if (a.resource_id === b.resource_id) {
        assert.equal(overlap(a, b), false, 'confirmed bookings must not overlap');
      }
    }
  }
}

test('model-based: ランダム操作列で不変条件を維持する', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const random = rng(seed);
    const engine = new BookingInventoryEngine();
    const item = engine.createItem({ tenant_id: 'T1', name: `Item-${seed}`, total_quantity: 5 });
    const resource = engine.createResource({
      tenant_id: 'T1',
      name: `Room-${seed}`,
      timezone: 'UTC',
      slot_granularity_minutes: 15,
      min_duration_minutes: 15,
      max_duration_minutes: 240
    });
    const holdIds = [];
    let now = new Date('2026-02-14T00:00:00Z');

    for (let step = 0; step < 60; step += 1) {
      const op = random();
      try {
        if (op < 0.35) {
          const useResource = random() < 0.5;
          const lines = useResource
            ? [
                {
                  kind: 'RESOURCE_SLOT',
                  resource_id: resource.resource_id,
                  start_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
                  end_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
                }
              ]
            : [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 1 }];
          const hold = engine.createHold({
            tenant_id: 'T1',
            created_by_user_id: 'U1',
            expires_in_seconds: 600,
            now,
            lines
          });
          holdIds.push(hold.hold_id);
        } else if (op < 0.6 && holdIds.length > 0) {
          const holdId = holdIds[Math.floor(random() * holdIds.length)];
          engine.confirmHold({ hold_id: holdId, now });
        } else if (op < 0.8 && holdIds.length > 0) {
          const holdId = holdIds[Math.floor(random() * holdIds.length)];
          engine.cancelHold({
            hold_id: holdId,
            actor_user_id: 'U1',
            is_admin: false,
            now
          });
        } else {
          now = new Date(now.getTime() + 61 * 1000);
          engine.expireHolds({ now });
        }
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
      }
      assertInvariants(engine, item.item_id);
    }
  }
});
