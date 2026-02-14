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

export class BookingInventoryEngine {
  constructor({ clock = () => new Date() } = {}) {
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
    this.items.set(item.item_id, item);
    return clone(item);
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
        if (new Date(raw.start_at).getTime() >= new Date(raw.end_at).getTime()) {
          throw new DomainError('INVALID_RESOURCE_SLOT', 'start_at must be before end_at', 400);
        }

        const existing = this.checkResourceAvailability(raw.resource_id, raw.start_at, raw.end_at);
        if (!existing.available) {
          throw new DomainError('RESOURCE_CONFLICT', 'resource slot is not available', 409, {
            resource_id: raw.resource_id,
            reason: existing.reason
          });
        }
        for (const p of provisionalResource) {
          if (p.resource_id === raw.resource_id && overlaps(raw.start_at, raw.end_at, p.start_at, p.end_at)) {
            throw new DomainError('RESOURCE_CONFLICT', 'resource slot overlaps within request', 409, {
              resource_id: raw.resource_id
            });
          }
        }
        provisionalResource.push({
          resource_id: raw.resource_id,
          start_at: raw.start_at,
          end_at: raw.end_at
        });
        normalizedLines.push({
          hold_line_id: this.nextId('HL', 'line'),
          kind: 'RESOURCE_SLOT',
          resource_id: raw.resource_id,
          start_at: toIso(raw.start_at),
          end_at: toIso(raw.end_at),
          item_id: null,
          quantity: null,
          status: 'ACTIVE',
          conflict_key: `${raw.resource_id}:${toIso(raw.start_at)}:${toIso(raw.end_at)}`
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
}
