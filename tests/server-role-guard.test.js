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

test('server role guard: VIEWER は hold 作成を実行できない', async () => {
  const port = 4500 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-role-viewer-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Viewer',
        total_quantity: 3
      })
    });
    assert.equal(itemRes.status, 201);
    const item = await itemRes.json();

    const createHoldRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'VIEWER',
        'x-user-id': 'UV1'
      },
      body: JSON.stringify({
        tenant_id: 'T1',
        created_by_user_id: 'UV1',
        expires_in_seconds: 600,
        lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 1 }]
      })
    });
    assert.equal(createHoldRes.status, 403);
  } finally {
    await server.stop();
  }
});

test('server hold guard: MEMBER は自分の hold のみ参照/confirm できる', async () => {
  const port = 4600 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-role-hold-guard-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Hold-Guard',
        total_quantity: 3
      })
    });
    assert.equal(itemRes.status, 201);
    const item = await itemRes.json();

    const ownerHoldRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U1'
      },
      body: JSON.stringify({
        tenant_id: 'T1',
        created_by_user_id: 'U1',
        expires_in_seconds: 600,
        lines: [{ kind: 'INVENTORY_QTY', item_id: item.item_id, quantity: 1 }]
      })
    });
    assert.equal(ownerHoldRes.status, 201);
    const ownerHold = await ownerHoldRes.json();

    const nonOwnerGetRes = await fetch(`${server.baseUrl}/api/v1/holds/${ownerHold.hold_id}`, {
      method: 'GET',
      headers: {
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U2'
      }
    });
    assert.equal(nonOwnerGetRes.status, 403);

    const nonOwnerConfirmRes = await fetch(`${server.baseUrl}/api/v1/holds/${ownerHold.hold_id}/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U2'
      },
      body: JSON.stringify({})
    });
    assert.equal(nonOwnerConfirmRes.status, 403);

    const ownerConfirmRes = await fetch(`${server.baseUrl}/api/v1/holds/${ownerHold.hold_id}/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U1'
      },
      body: JSON.stringify({})
    });
    assert.equal(ownerConfirmRes.status, 200);
    const confirmed = await ownerConfirmRes.json();
    assert.equal(confirmed.status, 'CONFIRMED');
  } finally {
    await server.stop();
  }
});

test('server hold confirm audit: ADMIN による代理 confirm の actor を記録する', async () => {
  const port = 4700 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-role-hold-admin-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Hold-Admin',
        total_quantity: 3
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

    const confirmRes = await fetch(`${server.baseUrl}/api/v1/holds/${hold.hold_id}/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'ADMIN',
        'x-user-id': 'UA',
        'x-request-id': 'REQ-CONFIRM-ADMIN'
      },
      body: JSON.stringify({})
    });
    assert.equal(confirmRes.status, 200);

    const auditRes = await fetch(
      `${server.baseUrl}/api/v1/audit-logs?tenant_id=T1&action=HOLD_CONFIRM&target_id=${hold.hold_id}&request_id=REQ-CONFIRM-ADMIN`
    );
    assert.equal(auditRes.status, 200);
    const logs = await auditRes.json();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actor_user_id, 'UA');
    assert.equal(logs[0].request_id, 'REQ-CONFIRM-ADMIN');
  } finally {
    await server.stop();
  }
});

test('server booking/reservation cancel guard: MEMBER 非ownerは拒否され ADMIN は実行できる', async () => {
  const port = 4800 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-role-cancel-guard-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const resourceRes = await fetch(`${server.baseUrl}/api/v1/resources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Room-Cancel-Guard',
        timezone: 'UTC',
        slot_granularity_minutes: 15,
        min_duration_minutes: 15,
        max_duration_minutes: 120,
        status: 'ACTIVE'
      })
    });
    assert.equal(resourceRes.status, 201);
    const resource = await resourceRes.json();

    const itemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Item-Cancel-Guard',
        total_quantity: 5
      })
    });
    assert.equal(itemRes.status, 201);
    const item = await itemRes.json();

    const holdRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U1'
      },
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
          },
          {
            kind: 'INVENTORY_QTY',
            item_id: item.item_id,
            quantity: 2
          }
        ]
      })
    });
    assert.equal(holdRes.status, 201);
    const hold = await holdRes.json();

    const confirmRes = await fetch(`${server.baseUrl}/api/v1/holds/${hold.hold_id}/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'MEMBER',
        'x-user-id': 'U1'
      },
      body: JSON.stringify({})
    });
    assert.equal(confirmRes.status, 200);
    const confirmed = await confirmRes.json();
    const bookingId = confirmed.bookings[0].booking_id;
    const reservationId = confirmed.reservations[0].reservation_id;

    const nonOwnerCancelBookingRes = await fetch(
      `${server.baseUrl}/api/v1/bookings/${bookingId}/cancel`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'T1',
          'x-user-role': 'MEMBER',
          'x-user-id': 'U2'
        },
        body: JSON.stringify({})
      }
    );
    assert.equal(nonOwnerCancelBookingRes.status, 403);

    const nonOwnerCancelReservationRes = await fetch(
      `${server.baseUrl}/api/v1/reservations/${reservationId}/cancel`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'T1',
          'x-user-role': 'MEMBER',
          'x-user-id': 'U2'
        },
        body: JSON.stringify({})
      }
    );
    assert.equal(nonOwnerCancelReservationRes.status, 403);

    const adminCancelBookingRes = await fetch(`${server.baseUrl}/api/v1/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'T1',
        'x-user-role': 'ADMIN',
        'x-user-id': 'UA'
      },
      body: JSON.stringify({})
    });
    assert.equal(adminCancelBookingRes.status, 200);
    const cancelledBooking = await adminCancelBookingRes.json();
    assert.equal(cancelledBooking.status, 'CANCELLED');

    const adminCancelReservationRes = await fetch(
      `${server.baseUrl}/api/v1/reservations/${reservationId}/cancel`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'T1',
          'x-user-role': 'ADMIN',
          'x-user-id': 'UA'
        },
        body: JSON.stringify({})
      }
    );
    assert.equal(adminCancelReservationRes.status, 200);
    const cancelledReservation = await adminCancelReservationRes.json();
    assert.equal(cancelledReservation.status, 'CANCELLED');
  } finally {
    await server.stop();
  }
});
