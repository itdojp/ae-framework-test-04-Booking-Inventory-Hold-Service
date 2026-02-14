import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('server validation: 不正リクエストを 400 で返す', async () => {
  const port = 3900 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-validation-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const invalidItemRes = await fetch(`${server.baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        name: 'Invalid',
        total_quantity: -1
      })
    });
    assert.equal(invalidItemRes.status, 400);

    const invalidHoldRes = await fetch(`${server.baseUrl}/api/v1/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'T1',
        created_by_user_id: 'U1',
        expires_in_seconds: 10,
        lines: []
      })
    });
    assert.equal(invalidHoldRes.status, 400);

    const invalidAvailRes = await fetch(
      `${server.baseUrl}/api/v1/resources/R1/availability?start_at=2026-02-14T10:00:00Z`
    );
    assert.equal(invalidAvailRes.status, 400);

    const invalidStatusRes = await fetch(`${server.baseUrl}/api/v1/items?status=UNKNOWN`);
    assert.equal(invalidStatusRes.status, 400);

    const invalidBookingsRangeRes = await fetch(
      `${server.baseUrl}/api/v1/bookings?start_at=2026-02-14T12:00:00Z&end_at=2026-02-14T11:00:00Z`
    );
    assert.equal(invalidBookingsRangeRes.status, 400);

    const invalidBookingsDateRes = await fetch(`${server.baseUrl}/api/v1/bookings?start_at=not-a-date`);
    assert.equal(invalidBookingsDateRes.status, 400);
  } finally {
    await server.stop();
  }
});
