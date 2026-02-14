import http from 'node:http';
import { BookingInventoryEngine } from './domain/booking-inventory-engine.js';
import { DomainError, isDomainError } from './domain/errors.js';
import { AsyncMutex } from './infra/async-mutex.js';
import { JsonStateStore } from './infra/json-state-store.js';
import {
  validateCancelBody,
  validateConfirmBody,
  validateCreateHoldBody,
  validateCreateItemBody,
  validateCreateResourceBody,
  validatePatchItemBody,
  validatePatchResourceBody,
  validateResourceAvailabilityQuery
} from './api/validators.js';

const stateFile = process.env.STATE_FILE ?? 'data/runtime-state.json';
const stateStore = new JsonStateStore(stateFile);
const initialSnapshot = stateStore.load();
const engine = new BookingInventoryEngine({ snapshot: initialSnapshot ?? undefined });
const mutationMutex = new AsyncMutex();

if (!initialSnapshot) {
  stateStore.save(engine.toSnapshot());
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError('INVALID_JSON', 'request body must be valid JSON', 400);
  }
}

async function runMutation(task) {
  return mutationMutex.run(async () => {
    const result = await task();
    stateStore.save(engine.toSnapshot());
    return result;
  });
}

function parsePath(pathname) {
  const holdConfirm = pathname.match(/^\/api\/v1\/holds\/([^/]+)\/confirm$/);
  if (holdConfirm) return { route: 'holdConfirm', params: { hold_id: holdConfirm[1] } };

  const holdCancel = pathname.match(/^\/api\/v1\/holds\/([^/]+)\/cancel$/);
  if (holdCancel) return { route: 'holdCancel', params: { hold_id: holdCancel[1] } };

  const holdGet = pathname.match(/^\/api\/v1\/holds\/([^/]+)$/);
  if (holdGet) return { route: 'holdGet', params: { hold_id: holdGet[1] } };

  const resourceAvailability = pathname.match(/^\/api\/v1\/resources\/([^/]+)\/availability$/);
  if (resourceAvailability) {
    return { route: 'resourceAvailability', params: { resource_id: resourceAvailability[1] } };
  }

  const resourcePatch = pathname.match(/^\/api\/v1\/resources\/([^/]+)$/);
  if (resourcePatch) return { route: 'resourcePatch', params: { resource_id: resourcePatch[1] } };

  const bookingCancel = pathname.match(/^\/api\/v1\/bookings\/([^/]+)\/cancel$/);
  if (bookingCancel) return { route: 'bookingCancel', params: { booking_id: bookingCancel[1] } };

  const reservationCancel = pathname.match(/^\/api\/v1\/reservations\/([^/]+)\/cancel$/);
  if (reservationCancel) {
    return { route: 'reservationCancel', params: { reservation_id: reservationCancel[1] } };
  }

  const itemAvailability = pathname.match(/^\/api\/v1\/items\/([^/]+)\/availability$/);
  if (itemAvailability) return { route: 'itemAvailability', params: { item_id: itemAvailability[1] } };

  const itemPatch = pathname.match(/^\/api\/v1\/items\/([^/]+)$/);
  if (itemPatch) return { route: 'itemPatch', params: { item_id: itemPatch[1] } };

  if (pathname === '/api/v1/resources') return { route: 'resources' };
  if (pathname === '/api/v1/items') return { route: 'items' };
  if (pathname === '/api/v1/holds') return { route: 'holds' };
  if (pathname === '/api/v1/bookings') return { route: 'bookings' };
  if (pathname === '/api/v1/reservations') return { route: 'reservations' };
  if (pathname === '/api/v1/system/expire') return { route: 'systemExpire' };
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

function optionalStatus(status) {
  if (!status) return undefined;
  if (!['ACTIVE', 'INACTIVE', 'CONFIRMED', 'CANCELLED'].includes(status)) {
    throw new DomainError('INVALID_QUERY', 'status query is invalid', 400, { status });
  }
  return status;
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
      sendJson(res, 200, { status: 'ok', state_file: stateFile });
      return;
    }

    if (matched.route === 'resources' && req.method === 'GET') {
      sendJson(res, 200, engine.listResources({ status: optionalStatus(url.searchParams.get('status')) }));
      return;
    }

    if (matched.route === 'resources' && req.method === 'POST') {
      const body = await readJson(req);
      validateCreateResourceBody(body);
      const resource = await runMutation(() => engine.createResource(body));
      sendJson(res, 201, resource);
      return;
    }

    if (matched.route === 'resourceAvailability' && req.method === 'GET') {
      const query = {
        start_at: url.searchParams.get('start_at'),
        end_at: url.searchParams.get('end_at'),
        granularity_minutes: url.searchParams.has('granularity_minutes')
          ? Number(url.searchParams.get('granularity_minutes'))
          : undefined,
        exclude_hold_id: url.searchParams.get('exclude_hold_id') ?? undefined
      };
      validateResourceAvailabilityQuery(query);
      sendJson(res, 200, engine.getResourceAvailability(matched.params.resource_id, query));
      return;
    }

    if (matched.route === 'resourcePatch' && req.method === 'PATCH') {
      const body = await readJson(req);
      validatePatchResourceBody(body);
      const resource = await runMutation(() =>
        engine.updateResource(matched.params.resource_id, body)
      );
      sendJson(res, 200, resource);
      return;
    }

    if (matched.route === 'items' && req.method === 'GET') {
      const status = optionalStatus(url.searchParams.get('status'));
      if (status && !['ACTIVE', 'INACTIVE'].includes(status)) {
        throw new DomainError('INVALID_QUERY', 'status query is invalid for items', 400, { status });
      }
      sendJson(res, 200, engine.listItems({ status }));
      return;
    }

    if (matched.route === 'items' && req.method === 'POST') {
      const body = await readJson(req);
      validateCreateItemBody(body);
      const item = await runMutation(() => engine.createItem(body));
      sendJson(res, 201, item);
      return;
    }

    if (matched.route === 'itemAvailability' && req.method === 'GET') {
      sendJson(res, 200, engine.getItemAvailability(matched.params.item_id));
      return;
    }

    if (matched.route === 'itemPatch' && req.method === 'PATCH') {
      const body = await readJson(req);
      validatePatchItemBody(body);
      const item = await runMutation(() => engine.updateItem(matched.params.item_id, body));
      sendJson(res, 200, item);
      return;
    }

    if (matched.route === 'holds' && req.method === 'POST') {
      const body = await readJson(req);
      validateCreateHoldBody(body);
      const headerIdempotencyKey = req.headers['idempotency-key'];
      const holdInput = {
        ...body,
        idempotency_key:
          body.idempotency_key ??
          (typeof headerIdempotencyKey === 'string' ? headerIdempotencyKey : undefined)
      };
      const hold = await runMutation(() => engine.createHold(holdInput));
      sendJson(res, 201, hold);
      return;
    }

    if (matched.route === 'holdGet' && req.method === 'GET') {
      sendJson(res, 200, engine.getHold(matched.params.hold_id));
      return;
    }

    if (matched.route === 'holdConfirm' && req.method === 'POST') {
      const body = await readJson(req);
      validateConfirmBody(body);
      const result = await runMutation(() =>
        engine.confirmHold({ hold_id: matched.params.hold_id, ...body })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'holdCancel' && req.method === 'POST') {
      const body = await readJson(req);
      validateCancelBody(body, 'INVALID_HOLD_CANCEL_REQUEST');
      const result = await runMutation(() =>
        engine.cancelHold({ hold_id: matched.params.hold_id, ...body })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'bookings' && req.method === 'GET') {
      const status = optionalStatus(url.searchParams.get('status'));
      if (status && !['CONFIRMED', 'CANCELLED'].includes(status)) {
        throw new DomainError('INVALID_QUERY', 'status query is invalid for bookings', 400, { status });
      }
      sendJson(
        res,
        200,
        engine.listBookings({
          resource_id: url.searchParams.get('resource_id') ?? undefined,
          start_at: url.searchParams.get('start_at') ?? undefined,
          end_at: url.searchParams.get('end_at') ?? undefined,
          status
        })
      );
      return;
    }

    if (matched.route === 'bookingCancel' && req.method === 'POST') {
      const body = await readJson(req);
      validateCancelBody(body, 'INVALID_BOOKING_CANCEL_REQUEST');
      const result = await runMutation(() =>
        engine.cancelBooking({ booking_id: matched.params.booking_id, ...body })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'reservations' && req.method === 'GET') {
      const status = optionalStatus(url.searchParams.get('status'));
      if (status && !['CONFIRMED', 'CANCELLED'].includes(status)) {
        throw new DomainError('INVALID_QUERY', 'status query is invalid for reservations', 400, { status });
      }
      sendJson(
        res,
        200,
        engine.listReservations({
          item_id: url.searchParams.get('item_id') ?? undefined,
          status
        })
      );
      return;
    }

    if (matched.route === 'reservationCancel' && req.method === 'POST') {
      const body = await readJson(req);
      validateCancelBody(body, 'INVALID_RESERVATION_CANCEL_REQUEST');
      const result = await runMutation(() =>
        engine.cancelReservation({ reservation_id: matched.params.reservation_id, ...body })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'systemExpire' && req.method === 'POST') {
      const body = await readJson(req);
      const expired = await runMutation(() =>
        engine.expireHolds({ now: body.now ? new Date(body.now) : undefined })
      );
      sendJson(res, 200, { expired });
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
