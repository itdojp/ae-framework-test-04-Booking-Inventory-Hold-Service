import http from 'node:http';
import { BookingInventoryEngine } from './domain/booking-inventory-engine.js';
import { DomainError, isDomainError } from './domain/errors.js';
import { AsyncMutex } from './infra/async-mutex.js';
import { JsonStateStore } from './infra/json-state-store.js';
import {
  validateAuditLogsQuery,
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
  if (pathname === '/api/v1/audit-logs') return { route: 'auditLogs' };
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

function headerValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function getRequestContext(req) {
  const role = headerValue(req.headers['x-user-role']);
  return {
    tenant_id: headerValue(req.headers['x-tenant-id']) ?? null,
    user_id: headerValue(req.headers['x-user-id']) ?? null,
    role: role ?? null,
    is_admin: role === 'ADMIN',
    request_id: headerValue(req.headers['x-request-id']) ?? null
  };
}

const allowedRoles = new Set(['ADMIN', 'MEMBER', 'VIEWER']);

function ensureRoleContext(context) {
  if (!context.role) return;
  if (!allowedRoles.has(context.role)) {
    throw new DomainError('INVALID_ROLE', 'x-user-role is invalid', 400, { role: context.role });
  }
  if (!context.is_admin && !context.user_id) {
    throw new DomainError('FORBIDDEN', 'x-user-id is required for MEMBER/VIEWER role', 403);
  }
}

function ensureRoleAllowed(context, acceptedRoles) {
  if (!context.role) return;
  if (!acceptedRoles.includes(context.role)) {
    throw new DomainError('FORBIDDEN', 'role is not allowed for this operation', 403, {
      role: context.role,
      accepted_roles: acceptedRoles
    });
  }
}

function ensureAdminIfRoleProvided(context) {
  if (context.role && !context.is_admin) {
    throw new DomainError('FORBIDDEN', 'admin role required', 403);
  }
}

function ensureTenantMatchForCreate(context, tenant_id) {
  if (context.tenant_id && context.tenant_id !== tenant_id) {
    throw new DomainError('FORBIDDEN', 'tenant mismatch', 403, {
      tenant_id,
      auth_tenant_id: context.tenant_id
    });
  }
}

function ensureActorMatch(context, actor_user_id) {
  if (context.user_id && actor_user_id && context.user_id !== actor_user_id) {
    throw new DomainError('FORBIDDEN', 'actor_user_id mismatch', 403, {
      actor_user_id,
      auth_user_id: context.user_id
    });
  }
}

function resolveActorUserId(context, actor_user_id) {
  if (context.user_id) {
    ensureActorMatch(context, actor_user_id);
    return context.user_id;
  }
  return actor_user_id;
}

function resolveIsAdmin(context, is_admin) {
  if (context.role) {
    return context.is_admin;
  }
  return Boolean(is_admin);
}

function ensureEntityForTenant(entity, { code, message, idField, idValue, tenant_id }) {
  if (!entity) {
    throw new DomainError(code, message, 404, { [idField]: idValue });
  }
  if (tenant_id && entity.tenant_id !== tenant_id) {
    throw new DomainError(code, message, 404, { [idField]: idValue });
  }
  return entity;
}

function ensureHoldOwnerOrAdmin(context, hold) {
  if (context.is_admin) return;
  if (!context.user_id) return;
  if (hold.created_by_user_id !== context.user_id) {
    throw new DomainError('FORBIDDEN', 'hold access is allowed only for owner or admin', 403, {
      hold_id: hold.hold_id
    });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const context = getRequestContext(req);
    ensureRoleContext(context);
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
      const status = optionalStatus(url.searchParams.get('status'));
      if (status && !['ACTIVE', 'INACTIVE'].includes(status)) {
        throw new DomainError('INVALID_QUERY', 'status query is invalid for resources', 400, { status });
      }
      let resources = engine.listResources({ status });
      if (context.tenant_id) {
        resources = resources.filter((resource) => resource.tenant_id === context.tenant_id);
      }
      sendJson(res, 200, resources);
      return;
    }

    if (matched.route === 'resources' && req.method === 'POST') {
      const body = await readJson(req);
      validateCreateResourceBody(body);
      ensureAdminIfRoleProvided(context);
      ensureTenantMatchForCreate(context, body.tenant_id);
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
      ensureEntityForTenant(engine.resources.get(matched.params.resource_id), {
        code: 'RESOURCE_NOT_FOUND',
        message: 'resource not found',
        idField: 'resource_id',
        idValue: matched.params.resource_id,
        tenant_id: context.tenant_id
      });
      sendJson(res, 200, engine.getResourceAvailability(matched.params.resource_id, query));
      return;
    }

    if (matched.route === 'resourcePatch' && req.method === 'PATCH') {
      const body = await readJson(req);
      validatePatchResourceBody(body);
      ensureAdminIfRoleProvided(context);
      ensureEntityForTenant(engine.resources.get(matched.params.resource_id), {
        code: 'RESOURCE_NOT_FOUND',
        message: 'resource not found',
        idField: 'resource_id',
        idValue: matched.params.resource_id,
        tenant_id: context.tenant_id
      });
      const resource = await runMutation(() =>
        engine.updateResource(matched.params.resource_id, body, {
          actor_user_id: context.user_id,
          request_id: context.request_id
        })
      );
      sendJson(res, 200, resource);
      return;
    }

    if (matched.route === 'items' && req.method === 'GET') {
      const status = optionalStatus(url.searchParams.get('status'));
      if (status && !['ACTIVE', 'INACTIVE'].includes(status)) {
        throw new DomainError('INVALID_QUERY', 'status query is invalid for items', 400, { status });
      }
      let items = engine.listItems({ status });
      if (context.tenant_id) {
        items = items.filter((item) => item.tenant_id === context.tenant_id);
      }
      sendJson(res, 200, items);
      return;
    }

    if (matched.route === 'items' && req.method === 'POST') {
      const body = await readJson(req);
      validateCreateItemBody(body);
      ensureAdminIfRoleProvided(context);
      ensureTenantMatchForCreate(context, body.tenant_id);
      const item = await runMutation(() => engine.createItem(body));
      sendJson(res, 201, item);
      return;
    }

    if (matched.route === 'itemAvailability' && req.method === 'GET') {
      ensureEntityForTenant(engine.items.get(matched.params.item_id), {
        code: 'ITEM_NOT_FOUND',
        message: 'item not found',
        idField: 'item_id',
        idValue: matched.params.item_id,
        tenant_id: context.tenant_id
      });
      sendJson(res, 200, engine.getItemAvailability(matched.params.item_id));
      return;
    }

    if (matched.route === 'itemPatch' && req.method === 'PATCH') {
      const body = await readJson(req);
      validatePatchItemBody(body);
      ensureAdminIfRoleProvided(context);
      ensureEntityForTenant(engine.items.get(matched.params.item_id), {
        code: 'ITEM_NOT_FOUND',
        message: 'item not found',
        idField: 'item_id',
        idValue: matched.params.item_id,
        tenant_id: context.tenant_id
      });
      const item = await runMutation(() =>
        engine.updateItem(matched.params.item_id, body, {
          actor_user_id: context.user_id,
          request_id: context.request_id
        })
      );
      sendJson(res, 200, item);
      return;
    }

    if (matched.route === 'holds' && req.method === 'POST') {
      const body = await readJson(req);
      validateCreateHoldBody(body);
      ensureRoleAllowed(context, ['ADMIN', 'MEMBER']);
      ensureTenantMatchForCreate(context, body.tenant_id);
      ensureActorMatch(context, body.created_by_user_id);
      const headerIdempotencyKey = req.headers['idempotency-key'];
      const holdInput = {
        ...body,
        created_by_user_id: context.user_id ?? body.created_by_user_id,
        idempotency_key:
          body.idempotency_key ??
          (typeof headerIdempotencyKey === 'string' ? headerIdempotencyKey : undefined),
        request_id: context.request_id ?? undefined
      };
      const hold = await runMutation(() => engine.createHold(holdInput));
      sendJson(res, 201, hold);
      return;
    }

    if (matched.route === 'holdGet' && req.method === 'GET') {
      ensureRoleAllowed(context, ['ADMIN', 'MEMBER', 'VIEWER']);
      const hold = ensureEntityForTenant(engine.holds.get(matched.params.hold_id), {
        code: 'HOLD_NOT_FOUND',
        message: 'hold not found',
        idField: 'hold_id',
        idValue: matched.params.hold_id,
        tenant_id: context.tenant_id
      });
      ensureHoldOwnerOrAdmin(context, hold);
      sendJson(res, 200, structuredClone(hold));
      return;
    }

    if (matched.route === 'holdConfirm' && req.method === 'POST') {
      const body = await readJson(req);
      validateConfirmBody(body);
      ensureRoleAllowed(context, ['ADMIN', 'MEMBER']);
      const hold = ensureEntityForTenant(engine.holds.get(matched.params.hold_id), {
        code: 'HOLD_NOT_FOUND',
        message: 'hold not found',
        idField: 'hold_id',
        idValue: matched.params.hold_id,
        tenant_id: context.tenant_id
      });
      ensureHoldOwnerOrAdmin(context, hold);
      const result = await runMutation(() =>
        engine.confirmHold({
          hold_id: matched.params.hold_id,
          ...body,
          actor_user_id: resolveActorUserId(context, body.actor_user_id),
          is_admin: resolveIsAdmin(context, body.is_admin),
          request_id: context.request_id ?? undefined
        })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'holdCancel' && req.method === 'POST') {
      const body = await readJson(req);
      validateCancelBody(body, 'INVALID_HOLD_CANCEL_REQUEST');
      ensureRoleAllowed(context, ['ADMIN', 'MEMBER']);
      ensureEntityForTenant(engine.holds.get(matched.params.hold_id), {
        code: 'HOLD_NOT_FOUND',
        message: 'hold not found',
        idField: 'hold_id',
        idValue: matched.params.hold_id,
        tenant_id: context.tenant_id
      });
      const result = await runMutation(() =>
        engine.cancelHold({
          hold_id: matched.params.hold_id,
          ...body,
          actor_user_id: resolveActorUserId(context, body.actor_user_id),
          is_admin: resolveIsAdmin(context, body.is_admin),
          request_id: context.request_id ?? undefined
        })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'bookings' && req.method === 'GET') {
      const status = optionalStatus(url.searchParams.get('status'));
      if (status && !['CONFIRMED', 'CANCELLED'].includes(status)) {
        throw new DomainError('INVALID_QUERY', 'status query is invalid for bookings', 400, { status });
      }
      let bookings = engine.listBookings({
        resource_id: url.searchParams.get('resource_id') ?? undefined,
        start_at: url.searchParams.get('start_at') ?? undefined,
        end_at: url.searchParams.get('end_at') ?? undefined,
        status
      });
      if (context.tenant_id) {
        bookings = bookings.filter((booking) => booking.tenant_id === context.tenant_id);
      }
      sendJson(res, 200, bookings);
      return;
    }

    if (matched.route === 'bookingCancel' && req.method === 'POST') {
      const body = await readJson(req);
      validateCancelBody(body, 'INVALID_BOOKING_CANCEL_REQUEST');
      ensureRoleAllowed(context, ['ADMIN', 'MEMBER']);
      ensureEntityForTenant(engine.bookings.get(matched.params.booking_id), {
        code: 'BOOKING_NOT_FOUND',
        message: 'booking not found',
        idField: 'booking_id',
        idValue: matched.params.booking_id,
        tenant_id: context.tenant_id
      });
      const result = await runMutation(() =>
        engine.cancelBooking({
          booking_id: matched.params.booking_id,
          ...body,
          actor_user_id: resolveActorUserId(context, body.actor_user_id),
          is_admin: resolveIsAdmin(context, body.is_admin),
          request_id: context.request_id ?? undefined
        })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'reservations' && req.method === 'GET') {
      const status = optionalStatus(url.searchParams.get('status'));
      if (status && !['CONFIRMED', 'CANCELLED'].includes(status)) {
        throw new DomainError('INVALID_QUERY', 'status query is invalid for reservations', 400, { status });
      }
      let reservations = engine.listReservations({
        item_id: url.searchParams.get('item_id') ?? undefined,
        status
      });
      if (context.tenant_id) {
        reservations = reservations.filter((reservation) => reservation.tenant_id === context.tenant_id);
      }
      sendJson(res, 200, reservations);
      return;
    }

    if (matched.route === 'reservationCancel' && req.method === 'POST') {
      const body = await readJson(req);
      validateCancelBody(body, 'INVALID_RESERVATION_CANCEL_REQUEST');
      ensureRoleAllowed(context, ['ADMIN', 'MEMBER']);
      ensureEntityForTenant(engine.reservations.get(matched.params.reservation_id), {
        code: 'RESERVATION_NOT_FOUND',
        message: 'reservation not found',
        idField: 'reservation_id',
        idValue: matched.params.reservation_id,
        tenant_id: context.tenant_id
      });
      const result = await runMutation(() =>
        engine.cancelReservation({
          reservation_id: matched.params.reservation_id,
          ...body,
          actor_user_id: resolveActorUserId(context, body.actor_user_id),
          is_admin: resolveIsAdmin(context, body.is_admin),
          request_id: context.request_id ?? undefined
        })
      );
      sendJson(res, 200, result);
      return;
    }

    if (matched.route === 'auditLogs' && req.method === 'GET') {
      const query = {
        tenant_id: url.searchParams.get('tenant_id') ?? undefined,
        actor_user_id: url.searchParams.get('actor_user_id') ?? undefined,
        action: url.searchParams.get('action') ?? undefined,
        target_type: url.searchParams.get('target_type') ?? undefined,
        target_id: url.searchParams.get('target_id') ?? undefined,
        request_id: url.searchParams.get('request_id') ?? undefined,
        from_at: url.searchParams.get('from_at') ?? undefined,
        to_at: url.searchParams.get('to_at') ?? undefined,
        limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined
      };
      if (context.tenant_id) {
        if (query.tenant_id && query.tenant_id !== context.tenant_id) {
          throw new DomainError('FORBIDDEN', 'tenant mismatch', 403);
        }
        query.tenant_id = context.tenant_id;
      }
      validateAuditLogsQuery(query);
      sendJson(res, 200, engine.listAuditLogs(query));
      return;
    }

    if (matched.route === 'systemExpire' && req.method === 'POST') {
      const body = await readJson(req);
      ensureAdminIfRoleProvided(context);
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
