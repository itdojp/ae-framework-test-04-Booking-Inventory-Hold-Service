import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('HTTP API smoke: create item -> hold -> confirm', async () => {
  const port = 3400 + Math.floor(Math.random() * 200);
  const stateFile = path.join(os.tmpdir(), `bi-smoke-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });
  const baseUrl = server.baseUrl;

  try {
    const createItemRes = await fetch(`${baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Tablet',
        total_quantity: 5
      })
    });
    assert.equal(createItemRes.status, 201);
    const item = await createItemRes.json();

    const createHoldRes = await fetch(`${baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        created_by_user_id: 'U1',
        expires_in_seconds: 600,
        lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 2 }]
      })
    });
    assert.equal(createHoldRes.status, 201);
    const hold = await createHoldRes.json();

    const confirmRes = await fetch(`${baseUrl}/api/v1/holds/${hold.hold_id}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(confirmRes.status, 200);
    const confirmed = await confirmRes.json();
    assert.equal(confirmed.status, 'CONFIRMED');
    assert.equal(confirmed.reservations.length, 1);

    const availRes = await fetch(`${baseUrl}/api/v1/items/${item.item_id}/availability`);
    assert.equal(availRes.status, 200);
    const availability = await availRes.json();
    assert.equal(availability.available_quantity, 3);

    const createResourceRes = await fetch(`${baseUrl}/api/v1/resources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Room-1',
        timezone: 'UTC',
        slot_granularity_minutes: 15,
        min_duration_minutes: 15,
        max_duration_minutes: 240
      })
    });
    assert.equal(createResourceRes.status, 201);
    const resource = await createResourceRes.json();

    const createResourceHoldRes = await fetch(`${baseUrl}/api/v1/holds`, {
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
            start_at: '2026-02-14T10:00:00Z',
            end_at: '2026-02-14T11:00:00Z'
          }
        ]
      })
    });
    assert.equal(createResourceHoldRes.status, 201);
    const resourceHold = await createResourceHoldRes.json();

    const confirmResourceHoldRes = await fetch(`${baseUrl}/api/v1/holds/${resourceHold.hold_id}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(confirmResourceHoldRes.status, 200);
    const confirmResource = await confirmResourceHoldRes.json();
    assert.equal(confirmResource.bookings.length, 1);

    const bookingsRes = await fetch(`${baseUrl}/api/v1/bookings?resource_id=${resource.resource_id}`);
    assert.equal(bookingsRes.status, 200);
    const bookings = await bookingsRes.json();
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0].status, 'CONFIRMED');

    const cancelBookingRes = await fetch(`${baseUrl}/api/v1/bookings/${bookings[0].booking_id}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor_user_id: 'U1' })
    });
    assert.equal(cancelBookingRes.status, 200);
    const cancelledBooking = await cancelBookingRes.json();
    assert.equal(cancelledBooking.status, 'CANCELLED');

    const resourceAvailRes = await fetch(
      `${baseUrl}/api/v1/resources/${resource.resource_id}/availability?start_at=2026-02-14T10:00:00Z&end_at=2026-02-14T11:00:00Z&granularity_minutes=60`
    );
    assert.equal(resourceAvailRes.status, 200);
    const resourceAvail = await resourceAvailRes.json();
    assert.equal(resourceAvail.slots.length, 1);
    assert.equal(resourceAvail.slots[0].available, true);
  } finally {
    await server.stop();
  }
});
