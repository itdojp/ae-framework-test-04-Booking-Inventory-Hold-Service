import { DomainError } from './errors.js';

function overlaps(aStart, aEnd, bStart, bEnd) {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  return aS < bE && bS < aE;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clone(value) {
  return structuredClone(value);
}

function requirePositiveInt(value, code, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainError(code, `${field} must be positive integer`, 400, { field, value });
  }
}

function asMap(list, key) {
  const map = new Map();
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (item && item[key]) map.set(item[key], item);
  }
  return map;
}

function mapValues(map) {
  return Array.from(map.values());
}

function requireStatus(value, allowed, code, field) {
  if (!allowed.includes(value)) {
    throw new DomainError(code, `${field} must be one of ${allowed.join(', ')}`, 400, {
      field,
      value,
      allowed
    });
  }
}

function validateResourceConstraints(resource, code = 'INVALID_RESOURCE') {
  requirePositiveInt(resource.slot_granularity_minutes, code, 'slot_granularity_minutes');
  requirePositiveInt(resource.min_duration_minutes, code, 'min_duration_minutes');
  requirePositiveInt(resource.max_duration_minutes, code, 'max_duration_minutes');
  if (resource.min_duration_minutes > resource.max_duration_minutes) {
    throw new DomainError(code, 'min_duration_minutes must be <= max_duration_minutes', 400, {
      min_duration_minutes: resource.min_duration_minutes,
      max_duration_minutes: resource.max_duration_minutes
    });
  }
}

function isSlotAligned(epochMs, granularityMinutes) {
  return Number.isInteger(epochMs) && epochMs % (granularityMinutes * 60_000) === 0;
}

export class BookingInventoryEngine {
  constructor({ clock = () => new Date(), snapshot = null } = {}) {
    this.clock = clock;
    this.resources = new Map();
    this.items = new Map();
    this.holds = new Map();
    this.bookings = new Map();
    this.reservations = new Map();
    this.auditLogs = [];
    this.idempotency = new Map();
    this.sequence = {
      resource: 0,
      item: 0,
      hold: 0,
      line: 0,
      booking: 0,
      reservation: 0,
      audit: 0
    };
    if (snapshot) {
      this.hydrate(snapshot);
    }
  }

  nextId(prefix, key) {
    this.sequence[key] += 1;
    return `${prefix}${this.sequence[key]}`;
  }

  addAudit({ tenant_id, actor_user_id, action, target_type, target_id, payload = {}, now }) {
    const audit = {
      audit_id: this.nextId('A', 'audit'),
      tenant_id,
      actor_user_id,
      action,
      target_type,
      target_id,
      payload,
      created_at: toIso(now)
    };
    this.auditLogs.push(audit);
  }

  hydrate(snapshot) {
    this.resources = asMap(snapshot.resources, 'resource_id');
    this.items = asMap(snapshot.items, 'item_id');
    this.holds = asMap(snapshot.holds, 'hold_id');
    this.bookings = asMap(snapshot.bookings, 'booking_id');
    this.reservations = asMap(snapshot.reservations, 'reservation_id');
    this.auditLogs = Array.isArray(snapshot.auditLogs) ? [...snapshot.auditLogs] : [];
    this.idempotency = new Map(Object.entries(snapshot.idempotency ?? {}));
    this.sequence = {
      resource: Number(snapshot.sequence?.resource ?? 0),
      item: Number(snapshot.sequence?.item ?? 0),
      hold: Number(snapshot.sequence?.hold ?? 0),
      line: Number(snapshot.sequence?.line ?? 0),
      booking: Number(snapshot.sequence?.booking ?? 0),
      reservation: Number(snapshot.sequence?.reservation ?? 0),
      audit: Number(snapshot.sequence?.audit ?? 0)
    };
  }

  toSnapshot() {
    return {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      sequence: clone(this.sequence),
      resources: mapValues(this.resources),
      items: mapValues(this.items),
      holds: mapValues(this.holds),
      bookings: mapValues(this.bookings),
      reservations: mapValues(this.reservations),
      auditLogs: clone(this.auditLogs),
      idempotency: Object.fromEntries(this.idempotency.entries())
    };
  }

  createResource(input) {
    const resource = {
      resource_id: input.resource_id ?? this.nextId('R', 'resource'),
      tenant_id: input.tenant_id,
      name: input.name,
      timezone: input.timezone ?? 'UTC',
      slot_granularity_minutes: input.slot_granularity_minutes ?? 15,
      min_duration_minutes: input.min_duration_minutes ?? 15,
      max_duration_minutes: input.max_duration_minutes ?? 240,
      status: input.status ?? 'ACTIVE'
    };
    if (!resource.tenant_id || !resource.name) {
      throw new DomainError('INVALID_RESOURCE', 'tenant_id and name are required', 400);
    }
    requireStatus(resource.status, ['ACTIVE', 'INACTIVE'], 'INVALID_RESOURCE', 'status');
    validateResourceConstraints(resource, 'INVALID_RESOURCE');
    this.resources.set(resource.resource_id, resource);
    return clone(resource);
  }

  createItem(input) {
    const item = {
      item_id: input.item_id ?? this.nextId('I', 'item'),
      tenant_id: input.tenant_id,
      name: input.name,
      total_quantity: input.total_quantity ?? 0,
      status: input.status ?? 'ACTIVE'
    };
    if (!item.tenant_id || !item.name) {
      throw new DomainError('INVALID_ITEM', 'tenant_id and name are required', 400);
    }
    if (!Number.isInteger(item.total_quantity) || item.total_quantity < 0) {
      throw new DomainError('INVALID_ITEM_QUANTITY', 'total_quantity must be integer >= 0', 400);
    }
    requireStatus(item.status, ['ACTIVE', 'INACTIVE'], 'INVALID_ITEM', 'status');
    this.items.set(item.item_id, item);
    return clone(item);
  }

  updateResource(resource_id, patch, { now = this.clock(), actor_user_id = null } = {}) {
    const resource = this.resources.get(resource_id);
    if (!resource) {
      throw new DomainError('RESOURCE_NOT_FOUND', 'resource not found', 404, { resource_id });
    }
    if (patch.name !== undefined) {
      if (typeof patch.name !== 'string' || patch.name.length === 0) {
        throw new DomainError('INVALID_RESOURCE', 'name must be non-empty string', 400, {
          resource_id,
          name: patch.name
        });
      }
      resource.name = patch.name;
    }
    if (patch.status !== undefined) {
      requireStatus(patch.status, ['ACTIVE', 'INACTIVE'], 'INVALID_RESOURCE', 'status');
      resource.status = patch.status;
    }
    if (patch.slot_granularity_minutes !== undefined) {
      requirePositiveInt(patch.slot_granularity_minutes, 'INVALID_RESOURCE', 'slot_granularity_minutes');
      resource.slot_granularity_minutes = patch.slot_granularity_minutes;
    }
    if (patch.min_duration_minutes !== undefined) {
      requirePositiveInt(patch.min_duration_minutes, 'INVALID_RESOURCE', 'min_duration_minutes');
      resource.min_duration_minutes = patch.min_duration_minutes;
    }
    if (patch.max_duration_minutes !== undefined) {
      requirePositiveInt(patch.max_duration_minutes, 'INVALID_RESOURCE', 'max_duration_minutes');
      resource.max_duration_minutes = patch.max_duration_minutes;
    }
    validateResourceConstraints(resource, 'INVALID_RESOURCE');
    this.addAudit({
      tenant_id: resource.tenant_id,
      actor_user_id,
      action: 'RESOURCE_UPDATE',
      target_type: 'RESOURCE',
      target_id: resource.resource_id,
      payload: clone(patch),
      now
    });
    return clone(resource);
  }

  updateItem(item_id, patch, { now = this.clock(), actor_user_id = null } = {}) {
    const item = this.items.get(item_id);
    if (!item) {
      throw new DomainError('ITEM_NOT_FOUND', 'item not found', 404, { item_id });
    }
    if (patch.name !== undefined) {
      if (typeof patch.name !== 'string' || patch.name.length === 0) {
        throw new DomainError('INVALID_ITEM', 'name must be non-empty string', 400, {
          item_id,
          name: patch.name
        });
      }
      item.name = patch.name;
    }
    if (patch.status !== undefined) {
      requireStatus(patch.status, ['ACTIVE', 'INACTIVE'], 'INVALID_ITEM', 'status');
      item.status = patch.status;
    }
    if (patch.total_quantity !== undefined) {
      if (!Number.isInteger(patch.total_quantity) || patch.total_quantity < 0) {
        throw new DomainError('INVALID_ITEM_QUANTITY', 'total_quantity must be integer >= 0', 400, {
          item_id,
          total_quantity: patch.total_quantity
        });
      }
      let reservedConfirmed = 0;
      let reservedHolds = 0;
      for (const reservation of this.reservations.values()) {
        if (reservation.item_id === item_id && reservation.status === 'CONFIRMED') {
          reservedConfirmed += reservation.quantity;
        }
      }
      for (const hold of this.holds.values()) {
        if (hold.status !== 'ACTIVE') continue;
        for (const line of hold.lines) {
          if (line.kind === 'INVENTORY_QTY' && line.item_id === item_id && line.status === 'ACTIVE') {
            reservedHolds += line.quantity;
          }
        }
      }
      const reservedQuantity = reservedConfirmed + reservedHolds;
      if (patch.total_quantity < reservedQuantity) {
        throw new DomainError('ITEM_QUANTITY_CONFLICT', 'total_quantity is lower than reserved quantity', 409, {
          item_id,
          total_quantity: patch.total_quantity,
          reserved_quantity: reservedQuantity
        });
      }
      item.total_quantity = patch.total_quantity;
    }
    this.addAudit({
      tenant_id: item.tenant_id,
      actor_user_id,
      action: 'ITEM_UPDATE',
      target_type: 'ITEM',
      target_id: item.item_id,
      payload: clone(patch),
      now
    });
    return clone(item);
  }

  listResources({ status } = {}) {
    const result = [];
    for (const resource of this.resources.values()) {
      if (status && resource.status !== status) continue;
      result.push(clone(resource));
    }
    return result;
  }

  listItems({ status } = {}) {
    const result = [];
    for (const item of this.items.values()) {
      if (status && item.status !== status) continue;
      result.push(clone(item));
    }
    return result;
  }

  getHold(hold_id) {
    const hold = this.holds.get(hold_id);
    if (!hold) {
      throw new DomainError('HOLD_NOT_FOUND', 'hold not found', 404, { hold_id });
    }
    return clone(hold);
  }

  getItemAvailability(item_id, { exclude_hold_id = null } = {}) {
    const item = this.items.get(item_id);
    if (!item || item.status !== 'ACTIVE') {
      throw new DomainError('ITEM_NOT_FOUND', 'item not found', 404, { item_id });
    }
    let reserved_confirmed = 0;
    let reserved_holds = 0;

    for (const reservation of this.reservations.values()) {
      if (reservation.item_id === item_id && reservation.status === 'CONFIRMED') {
        reserved_confirmed += reservation.quantity;
      }
    }

    for (const hold of this.holds.values()) {
      if (hold.status !== 'ACTIVE') continue;
      if (exclude_hold_id && hold.hold_id === exclude_hold_id) continue;
      for (const line of hold.lines) {
        if (line.kind === 'INVENTORY_QTY' && line.item_id === item_id && line.status === 'ACTIVE') {
          reserved_holds += line.quantity;
        }
      }
    }

    return {
      item_id,
      total_quantity: item.total_quantity,
      reserved_confirmed,
      reserved_holds,
      available_quantity: item.total_quantity - reserved_confirmed - reserved_holds
    };
  }

  checkResourceAvailability(resource_id, start_at, end_at, { exclude_hold_id = null } = {}) {
    const resource = this.resources.get(resource_id);
    if (!resource || resource.status !== 'ACTIVE') {
      throw new DomainError('RESOURCE_NOT_FOUND', 'resource not found', 404, { resource_id });
    }
    for (const booking of this.bookings.values()) {
      if (booking.resource_id !== resource_id || booking.status !== 'CONFIRMED') continue;
      if (overlaps(start_at, end_at, booking.start_at, booking.end_at)) {
        return { available: false, reason: 'BOOKED' };
      }
    }
    for (const hold of this.holds.values()) {
      if (hold.status !== 'ACTIVE') continue;
      if (exclude_hold_id && hold.hold_id === exclude_hold_id) continue;
      for (const line of hold.lines) {
        if (line.kind !== 'RESOURCE_SLOT' || line.status !== 'ACTIVE' || line.resource_id !== resource_id) {
          continue;
        }
        if (overlaps(start_at, end_at, line.start_at, line.end_at)) {
          return { available: false, reason: 'HELD' };
        }
      }
    }
    return { available: true, reason: null };
  }

  getResourceAvailability(resource_id, input) {
    const startMs = new Date(input.start_at).getTime();
    const endMs = new Date(input.end_at).getTime();
    const resource = this.resources.get(resource_id);
    if (!resource) {
      throw new DomainError('RESOURCE_NOT_FOUND', 'resource not found', 404, { resource_id });
    }
    const granularity = Number(input.granularity_minutes ?? resource.slot_granularity_minutes);
    const exclude_hold_id = input.exclude_hold_id ?? null;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
      throw new DomainError('INVALID_RANGE', 'start_at and end_at range is invalid', 400);
    }
    if (!Number.isInteger(granularity) || granularity <= 0) {
      throw new DomainError('INVALID_GRANULARITY', 'granularity_minutes must be > 0', 400);
    }

    const slots = [];
    for (let cursor = startMs; cursor < endMs; cursor += granularity * 60_000) {
      const next = Math.min(cursor + granularity * 60_000, endMs);
      const slotStart = new Date(cursor).toISOString();
      const slotEnd = new Date(next).toISOString();
      const availability = this.checkResourceAvailability(resource_id, slotStart, slotEnd, { exclude_hold_id });
      slots.push({
        start_at: slotStart,
        end_at: slotEnd,
        available: availability.available,
        reason: availability.reason
      });
    }
    return {
      resource_id,
      range: { start_at: new Date(startMs).toISOString(), end_at: new Date(endMs).toISOString() },
      slots
    };
  }

  createHold(input) {
    const now = input.now ?? this.clock();
    const nowIso = toIso(now);
    const tenant_id = input.tenant_id;
    const created_by_user_id = input.created_by_user_id;
    const expires_in_seconds = input.expires_in_seconds;
    const lines = Array.isArray(input.lines) ? input.lines : [];
    const idempotency_key = input.idempotency_key ?? null;

    if (!tenant_id || !created_by_user_id) {
      throw new DomainError('INVALID_HOLD_REQUEST', 'tenant_id and created_by_user_id are required', 400);
    }
    if (!Number.isInteger(expires_in_seconds) || expires_in_seconds < 60 || expires_in_seconds > 3600) {
      throw new DomainError('INVALID_EXPIRES_IN', 'expires_in_seconds must be in [60, 3600]', 400);
    }
    if (lines.length < 1 || lines.length > 10) {
      throw new DomainError('INVALID_HOLD_LINES', 'lines must be in [1, 10]', 400);
    }

    if (idempotency_key) {
      const key = `${tenant_id}:${created_by_user_id}:${idempotency_key}`;
      const existingHoldId = this.idempotency.get(key);
      if (existingHoldId) {
        return this.getHold(existingHoldId);
      }
    }

    const provisionalItem = new Map();
    const provisionalResource = [];
    const normalizedLines = [];

    for (const raw of lines) {
      if (raw.kind === 'RESOURCE_SLOT') {
        const resource = this.resources.get(raw.resource_id);
        if (!resource || resource.tenant_id !== tenant_id || resource.status !== 'ACTIVE') {
          throw new DomainError('RESOURCE_NOT_FOUND', 'resource not found', 404, { resource_id: raw.resource_id });
        }
        if (!raw.start_at || !raw.end_at) {
          throw new DomainError('INVALID_RESOURCE_SLOT', 'start_at and end_at are required', 400);
        }
        const startIso = toIso(raw.start_at);
        const endIso = toIso(raw.end_at);
        const startMs = new Date(startIso).getTime();
        const endMs = new Date(endIso).getTime();
        if (startMs >= endMs) {
          throw new DomainError('INVALID_RESOURCE_SLOT', 'start_at must be before end_at', 400);
        }
        if (!isSlotAligned(startMs, resource.slot_granularity_minutes)) {
          throw new DomainError(
            'INVALID_RESOURCE_SLOT_ALIGNMENT',
            'start_at must align to resource slot granularity',
            400,
            {
              resource_id: raw.resource_id,
              slot_granularity_minutes: resource.slot_granularity_minutes,
              start_at: startIso
            }
          );
        }
        if (!isSlotAligned(endMs, resource.slot_granularity_minutes)) {
          throw new DomainError(
            'INVALID_RESOURCE_SLOT_ALIGNMENT',
            'end_at must align to resource slot granularity',
            400,
            {
              resource_id: raw.resource_id,
              slot_granularity_minutes: resource.slot_granularity_minutes,
              end_at: endIso
            }
          );
        }
        const durationMinutes = (endMs - startMs) / 60_000;
        if (
          durationMinutes < resource.min_duration_minutes ||
          durationMinutes > resource.max_duration_minutes
        ) {
          throw new DomainError(
            'INVALID_RESOURCE_SLOT_DURATION',
            'resource slot duration is out of allowed range',
            400,
            {
              resource_id: raw.resource_id,
              duration_minutes: durationMinutes,
              min_duration_minutes: resource.min_duration_minutes,
              max_duration_minutes: resource.max_duration_minutes
            }
          );
        }

        const existing = this.checkResourceAvailability(raw.resource_id, startIso, endIso);
        if (!existing.available) {
          throw new DomainError('RESOURCE_CONFLICT', 'resource slot is not available', 409, {
            resource_id: raw.resource_id,
            reason: existing.reason
          });
        }
        for (const p of provisionalResource) {
          if (p.resource_id === raw.resource_id && overlaps(startIso, endIso, p.start_at, p.end_at)) {
            throw new DomainError('RESOURCE_CONFLICT', 'resource slot overlaps within request', 409, {
              resource_id: raw.resource_id
            });
          }
        }
        provisionalResource.push({
          resource_id: raw.resource_id,
          start_at: startIso,
          end_at: endIso
        });
        normalizedLines.push({
          hold_line_id: this.nextId('HL', 'line'),
          kind: 'RESOURCE_SLOT',
          resource_id: raw.resource_id,
          start_at: startIso,
          end_at: endIso,
          item_id: null,
          quantity: null,
          status: 'ACTIVE',
          conflict_key: `${raw.resource_id}:${startIso}:${endIso}`
        });
      } else if (raw.kind === 'INVENTORY_QTY') {
        requirePositiveInt(raw.quantity, 'INVALID_QUANTITY', 'quantity');
        if (raw.quantity > 100) {
          throw new DomainError('INVALID_QUANTITY', 'quantity must be <= 100', 400);
        }
        const item = this.items.get(raw.item_id);
        if (!item || item.tenant_id !== tenant_id || item.status !== 'ACTIVE') {
          throw new DomainError('ITEM_NOT_FOUND', 'item not found', 404, { item_id: raw.item_id });
        }
        const availability = this.getItemAvailability(raw.item_id);
        const requested = provisionalItem.get(raw.item_id) ?? 0;
        if (availability.available_quantity - requested < raw.quantity) {
          throw new DomainError('INSUFFICIENT_INVENTORY', 'insufficient inventory', 409, {
            item_id: raw.item_id,
            requested: raw.quantity
          });
        }
        provisionalItem.set(raw.item_id, requested + raw.quantity);
        normalizedLines.push({
          hold_line_id: this.nextId('HL', 'line'),
          kind: 'INVENTORY_QTY',
          resource_id: null,
          start_at: null,
          end_at: null,
          item_id: raw.item_id,
          quantity: raw.quantity,
          status: 'ACTIVE',
          conflict_key: `${raw.item_id}`
        });
      } else {
        throw new DomainError('INVALID_HOLD_LINE_KIND', 'line kind must be RESOURCE_SLOT or INVENTORY_QTY', 400);
      }
    }

    const hold = {
      hold_id: this.nextId('H', 'hold'),
      tenant_id,
      created_by_user_id,
      status: 'ACTIVE',
      expires_at: new Date(new Date(nowIso).getTime() + expires_in_seconds * 1000).toISOString(),
      created_at: nowIso,
      updated_at: nowIso,
      confirmed_at: null,
      cancelled_at: null,
      expired_at: null,
      idempotency_key,
      note: input.note ?? null,
      lines: normalizedLines
    };
    this.holds.set(hold.hold_id, hold);
    if (idempotency_key) {
      const key = `${tenant_id}:${created_by_user_id}:${idempotency_key}`;
      this.idempotency.set(key, hold.hold_id);
    }
    this.addAudit({
      tenant_id,
      actor_user_id: created_by_user_id,
      action: 'HOLD_CREATE',
      target_type: 'HOLD',
      target_id: hold.hold_id,
      payload: { line_count: lines.length },
      now
    });
    return clone(hold);
  }

  buildConfirmResponse(hold) {
    const bookings = [];
    const reservations = [];
    for (const booking of this.bookings.values()) {
      if (booking.source_hold_id === hold.hold_id) bookings.push(clone(booking));
    }
    for (const reservation of this.reservations.values()) {
      if (reservation.source_hold_id === hold.hold_id) reservations.push(clone(reservation));
    }
    return {
      hold_id: hold.hold_id,
      status: hold.status,
      bookings,
      reservations
    };
  }

  expireHoldInternal(hold, now) {
    const nowIso = toIso(now);
    hold.status = 'EXPIRED';
    hold.expired_at = nowIso;
    hold.updated_at = nowIso;
    for (const line of hold.lines) line.status = 'RELEASED';
    this.addAudit({
      tenant_id: hold.tenant_id,
      actor_user_id: null,
      action: 'HOLD_EXPIRE',
      target_type: 'HOLD',
      target_id: hold.hold_id,
      now
    });
  }

  confirmHold(input) {
    const hold_id = input.hold_id;
    const now = input.now ?? this.clock();
    const hold = this.holds.get(hold_id);
    if (!hold) {
      throw new DomainError('HOLD_NOT_FOUND', 'hold not found', 404, { hold_id });
    }
    if (hold.status === 'CONFIRMED') {
      return this.buildConfirmResponse(hold);
    }
    if (hold.status !== 'ACTIVE') {
      throw new DomainError('INVALID_HOLD_STATUS', 'only ACTIVE hold can be confirmed', 409, {
        hold_id,
        status: hold.status
      });
    }
    if (new Date(now).getTime() >= new Date(hold.expires_at).getTime()) {
      this.expireHoldInternal(hold, now);
      throw new DomainError('HOLD_EXPIRED', 'hold is expired', 409, { hold_id });
    }

    for (const line of hold.lines) {
      if (line.kind === 'RESOURCE_SLOT') {
        const availability = this.checkResourceAvailability(line.resource_id, line.start_at, line.end_at, {
          exclude_hold_id: hold.hold_id
        });
        if (!availability.available) {
          throw new DomainError('RESOURCE_CONFLICT', 'resource conflict at confirm', 409, {
            hold_id,
            resource_id: line.resource_id
          });
        }
      } else if (line.kind === 'INVENTORY_QTY') {
        const availability = this.getItemAvailability(line.item_id, { exclude_hold_id: hold.hold_id });
        if (availability.available_quantity < line.quantity) {
          throw new DomainError('INSUFFICIENT_INVENTORY', 'insufficient inventory at confirm', 409, {
            hold_id,
            item_id: line.item_id
          });
        }
      }
    }

    const nowIso = toIso(now);
    for (const line of hold.lines) {
      if (line.kind === 'RESOURCE_SLOT') {
        const booking = {
          booking_id: this.nextId('B', 'booking'),
          tenant_id: hold.tenant_id,
          resource_id: line.resource_id,
          start_at: line.start_at,
          end_at: line.end_at,
          created_by_user_id: hold.created_by_user_id,
          status: 'CONFIRMED',
          source_hold_id: hold.hold_id,
          created_at: nowIso,
          updated_at: nowIso,
          cancelled_at: null
        };
        this.bookings.set(booking.booking_id, booking);
      }
      if (line.kind === 'INVENTORY_QTY') {
        const reservation = {
          reservation_id: this.nextId('S', 'reservation'),
          tenant_id: hold.tenant_id,
          item_id: line.item_id,
          quantity: line.quantity,
          created_by_user_id: hold.created_by_user_id,
          status: 'CONFIRMED',
          source_hold_id: hold.hold_id,
          created_at: nowIso,
          updated_at: nowIso,
          cancelled_at: null
        };
        this.reservations.set(reservation.reservation_id, reservation);
      }
      line.status = 'RELEASED';
    }

    hold.status = 'CONFIRMED';
    hold.confirmed_at = nowIso;
    hold.updated_at = nowIso;
    this.addAudit({
      tenant_id: hold.tenant_id,
      actor_user_id: hold.created_by_user_id,
      action: 'HOLD_CONFIRM',
      target_type: 'HOLD',
      target_id: hold.hold_id,
      now
    });

    return this.buildConfirmResponse(hold);
  }

  cancelHold(input) {
    const hold_id = input.hold_id;
    const actor_user_id = input.actor_user_id;
    const is_admin = Boolean(input.is_admin);
    const now = input.now ?? this.clock();
    const hold = this.holds.get(hold_id);
    if (!hold) {
      throw new DomainError('HOLD_NOT_FOUND', 'hold not found', 404, { hold_id });
    }
    if (hold.status !== 'ACTIVE') {
      throw new DomainError('INVALID_HOLD_STATUS', 'only ACTIVE hold can be cancelled', 409, {
        hold_id,
        status: hold.status
      });
    }
    if (!is_admin && hold.created_by_user_id !== actor_user_id) {
      throw new DomainError('FORBIDDEN', 'cancel is allowed only for owner or admin', 403, { hold_id });
    }
    const nowIso = toIso(now);
    hold.status = 'CANCELLED';
    hold.cancelled_at = nowIso;
    hold.updated_at = nowIso;
    for (const line of hold.lines) line.status = 'RELEASED';
    this.addAudit({
      tenant_id: hold.tenant_id,
      actor_user_id,
      action: 'HOLD_CANCEL',
      target_type: 'HOLD',
      target_id: hold.hold_id,
      now
    });
    return clone(hold);
  }

  expireHolds({ now = this.clock() } = {}) {
    let expired = 0;
    for (const hold of this.holds.values()) {
      if (hold.status !== 'ACTIVE') continue;
      if (new Date(hold.expires_at).getTime() <= new Date(now).getTime()) {
        this.expireHoldInternal(hold, now);
        expired += 1;
      }
    }
    return expired;
  }

  listBookings(filters = {}) {
    const list = [];
    const start = filters.start_at ? new Date(filters.start_at).getTime() : null;
    const end = filters.end_at ? new Date(filters.end_at).getTime() : null;
    for (const booking of this.bookings.values()) {
      if (filters.resource_id && booking.resource_id !== filters.resource_id) continue;
      if (filters.status && booking.status !== filters.status) continue;
      if (start !== null && new Date(booking.end_at).getTime() <= start) continue;
      if (end !== null && new Date(booking.start_at).getTime() >= end) continue;
      list.push(clone(booking));
    }
    return list;
  }

  listReservations(filters = {}) {
    const list = [];
    for (const reservation of this.reservations.values()) {
      if (filters.item_id && reservation.item_id !== filters.item_id) continue;
      if (filters.status && reservation.status !== filters.status) continue;
      list.push(clone(reservation));
    }
    return list;
  }

  listAuditLogs(filters = {}) {
    const fromAt = filters.from_at ? new Date(filters.from_at).getTime() : null;
    const toAt = filters.to_at ? new Date(filters.to_at).getTime() : null;
    const limit = filters.limit ?? null;
    const list = [];
    for (const audit of this.auditLogs) {
      if (filters.tenant_id && audit.tenant_id !== filters.tenant_id) continue;
      if (filters.actor_user_id && audit.actor_user_id !== filters.actor_user_id) continue;
      if (filters.action && audit.action !== filters.action) continue;
      if (filters.target_type && audit.target_type !== filters.target_type) continue;
      if (filters.target_id && audit.target_id !== filters.target_id) continue;
      const createdAtMs = new Date(audit.created_at).getTime();
      if (fromAt !== null && createdAtMs < fromAt) continue;
      if (toAt !== null && createdAtMs > toAt) continue;
      list.push(clone(audit));
    }
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (limit === null || limit === undefined) return list;
    return list.slice(0, limit);
  }

  cancelBooking(input) {
    const booking = this.bookings.get(input.booking_id);
    if (!booking) {
      throw new DomainError('BOOKING_NOT_FOUND', 'booking not found', 404, { booking_id: input.booking_id });
    }
    if (booking.status !== 'CONFIRMED') {
      throw new DomainError('INVALID_BOOKING_STATUS', 'booking is already cancelled', 409, {
        booking_id: input.booking_id,
        status: booking.status
      });
    }
    if (!input.is_admin && booking.created_by_user_id !== input.actor_user_id) {
      throw new DomainError('FORBIDDEN', 'cancel is allowed only for owner or admin', 403, {
        booking_id: input.booking_id
      });
    }
    const nowIso = toIso(input.now ?? this.clock());
    booking.status = 'CANCELLED';
    booking.cancelled_at = nowIso;
    booking.updated_at = nowIso;
    this.addAudit({
      tenant_id: booking.tenant_id,
      actor_user_id: input.actor_user_id,
      action: 'BOOKING_CANCEL',
      target_type: 'BOOKING',
      target_id: booking.booking_id,
      now: input.now ?? this.clock()
    });
    return clone(booking);
  }

  cancelReservation(input) {
    const reservation = this.reservations.get(input.reservation_id);
    if (!reservation) {
      throw new DomainError('RESERVATION_NOT_FOUND', 'reservation not found', 404, {
        reservation_id: input.reservation_id
      });
    }
    if (reservation.status !== 'CONFIRMED') {
      throw new DomainError('INVALID_RESERVATION_STATUS', 'reservation is already cancelled', 409, {
        reservation_id: input.reservation_id,
        status: reservation.status
      });
    }
    if (!input.is_admin && reservation.created_by_user_id !== input.actor_user_id) {
      throw new DomainError('FORBIDDEN', 'cancel is allowed only for owner or admin', 403, {
        reservation_id: input.reservation_id
      });
    }
    const nowIso = toIso(input.now ?? this.clock());
    reservation.status = 'CANCELLED';
    reservation.cancelled_at = nowIso;
    reservation.updated_at = nowIso;
    this.addAudit({
      tenant_id: reservation.tenant_id,
      actor_user_id: input.actor_user_id,
      action: 'RESERVATION_CANCEL',
      target_type: 'RESERVATION',
      target_id: reservation.reservation_id,
      now: input.now ?? this.clock()
    });
    return clone(reservation);
  }
}
