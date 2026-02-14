import http from 'node:http';
import { BookingInventoryEngine } from './domain/booking-inventory-engine.js';
import { isDomainError } from './domain/errors.js';

const engine = new BookingInventoryEngine();

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function parsePath(pathname) {
  const holdConfirm = pathname.match(/^\/api\/v1\/holds\/([^/]+)\/confirm$/);
  if (holdConfirm) return { route: 'holdConfirm', params: { hold_id: holdConfirm[1] } };

  const holdCancel = pathname.match(/^\/api\/v1\/holds\/([^/]+)\/cancel$/);
  if (holdCancel) return { route: 'holdCancel', params: { hold_id: holdCancel[1] } };

  const holdGet = pathname.match(/^\/api\/v1\/holds\/([^/]+)$/);
  if (holdGet) return { route: 'holdGet', params: { hold_id: holdGet[1] } };

  const resourceAvailability = pathname.match(/^\/api\/v1\/resources\/([^/]+)\/availability$/);
  if (resourceAvailability) return { route: 'resourceAvailability', params: { resource_id: resourceAvailability[1] } };

  const bookingCancel = pathname.match(/^\/api\/v1\/bookings\/([^/]+)\/cancel$/);
  if (bookingCancel) return { route: 'bookingCancel', params: { booking_id: bookingCancel[1] } };

  const reservationCancel = pathname.match(/^\/api\/v1\/reservations\/([^/]+)\/cancel$/);
  if (reservationCancel) return { route: 'reservationCancel', params: { reservation_id: reservationCancel[1] } };

  const itemAvailability = pathname.match(/^\/api\/v1\/items\/([^/]+)\/availability$/);
  if (itemAvailability) return { route: 'itemAvailability', params: { item_id: itemAvailability[1] } };

  if (pathname === '/api/v1/resources') return { route: 'resources' };
  if (pathname === '/api/v1/items') return { route: 'items' };
  if (pathname === '/api/v1/holds') return { route: 'holds' };
  if (pathname === '/api/v1/bookings') return { route: 'bookings' };
  if (pathname === '/api/v1/reservations') return { route: 'reservations' };
  if (pathname === '/healthz') return { route: 'healthz' };
  return null;
}

function toErrorBody(error) {
  return {
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.message ?? 'internal error',
      details: error.details ?? {}
    }
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const matched = parsePath(url.pathname);
    if (!matched) {
      sendJson(res, 404, {
        error: {
          code: 'NOT_FOUND',
          message: 'route not found',
          details: { pathname: url.pathname }
        }
      });
      return;
    }

    if (matched.route === 'healthz' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (matched.route === 'resources' && req.method === 'GET') {
      const status = url.searchParams.get('status') ?? undefined;
      sendJson(res, 200, engine.listResources({ status }));
      return;
    }

    if (matched.route === 'resources' && req.method === 'POST') {
      const body = await readJson(req);
      sendJson(res, 201, engine.createResource(body));
      return;
    }

    if (matched.route === 'resourceAvailability' && req.method === 'GET') {
      sendJson(
        res,
        200,
        engine.getResourceAvailability(matched.params.resource_id, {
          start_at: url.searchParams.get('start_at'),
          end_at: url.searchParams.get('end_at'),
          granularity_minutes: url.searchParams.get('granularity_minutes')
            ? Number(url.searchParams.get('granularity_minutes'))
            : undefined,
          exclude_hold_id: url.searchParams.get('exclude_hold_id') ?? undefined
        })
      );
      return;
    }

    if (matched.route === 'items' && req.method === 'GET') {
      const status = url.searchParams.get('status') ?? undefined;
      sendJson(res, 200, engine.listItems({ status }));
      return;
    }

    if (matched.route === 'items' && req.method === 'POST') {
      const body = await readJson(req);
      sendJson(res, 201, engine.createItem(body));
      return;
    }

    if (matched.route === 'itemAvailability' && req.method === 'GET') {
      sendJson(res, 200, engine.getItemAvailability(matched.params.item_id));
      return;
    }

    if (matched.route === 'holds' && req.method === 'POST') {
      const body = await readJson(req);
      sendJson(res, 201, engine.createHold(body));
      return;
    }

    if (matched.route === 'holdGet' && req.method === 'GET') {
      const hold = engine.getHold(matched.params.hold_id);
      sendJson(res, 200, hold);
      return;
    }

    if (matched.route === 'holdConfirm' && req.method === 'POST') {
      const body = await readJson(req);
      const result = engine.confirmHold({ hold_id: matched.params.hold_id, ...body });
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'holdCancel' && req.method === 'POST') {
      const body = await readJson(req);
      const result = engine.cancelHold({ hold_id: matched.params.hold_id, ...body });
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'bookings' && req.method === 'GET') {
      sendJson(
        res,
        200,
        engine.listBookings({
          resource_id: url.searchParams.get('resource_id') ?? undefined,
          start_at: url.searchParams.get('start_at') ?? undefined,
          end_at: url.searchParams.get('end_at') ?? undefined,
          status: url.searchParams.get('status') ?? undefined
        })
      );
      return;
    }

    if (matched.route === 'bookingCancel' && req.method === 'POST') {
      const body = await readJson(req);
      sendJson(res, 200, engine.cancelBooking({ booking_id: matched.params.booking_id, ...body }));
      return;
    }

    if (matched.route === 'reservations' && req.method === 'GET') {
      sendJson(
        res,
        200,
        engine.listReservations({
          item_id: url.searchParams.get('item_id') ?? undefined,
          status: url.searchParams.get('status') ?? undefined
        })
      );
      return;
    }

    if (matched.route === 'reservationCancel' && req.method === 'POST') {
      const body = await readJson(req);
      sendJson(
        res,
        200,
        engine.cancelReservation({ reservation_id: matched.params.reservation_id, ...body })
      );
      return;
    }

    sendJson(res, 405, {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'method not allowed',
        details: { route: matched.route, method: req.method }
      }
    });
  } catch (error) {
    if (isDomainError(error)) {
      sendJson(res, error.status ?? 409, toErrorBody(error));
      return;
    }
    sendJson(res, 500, toErrorBody(error));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`booking-inventory-hold-service listening on :${port}`);
});
