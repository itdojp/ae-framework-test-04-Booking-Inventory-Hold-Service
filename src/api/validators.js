import { DomainError } from '../domain/errors.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(body, code = 'INVALID_BODY') {
  if (!isObject(body)) {
    throw new DomainError(code, 'request body must be object', 400);
  }
}

function requireString(value, field, code = 'INVALID_BODY') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DomainError(code, `${field} is required`, 400, { field });
  }
}

function requireInteger(value, field, { min = null, max = null, code = 'INVALID_BODY' } = {}) {
  if (!Number.isInteger(value)) {
    throw new DomainError(code, `${field} must be integer`, 400, { field, value });
  }
  if (min !== null && value < min) {
    throw new DomainError(code, `${field} must be >= ${min}`, 400, { field, value });
  }
  if (max !== null && value > max) {
    throw new DomainError(code, `${field} must be <= ${max}`, 400, { field, value });
  }
}

function requireDateTime(value, field, code = 'INVALID_BODY') {
  requireString(value, field, code);
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) {
    throw new DomainError(code, `${field} must be date-time`, 400, { field, value });
  }
}

function optionalBoolean(value, field, code = 'INVALID_BODY') {
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new DomainError(code, `${field} must be boolean`, 400, { field, value });
  }
}

export function validateCreateResourceBody(body) {
  requireObject(body, 'INVALID_RESOURCE');
  requireString(body.tenant_id, 'tenant_id', 'INVALID_RESOURCE');
  requireString(body.name, 'name', 'INVALID_RESOURCE');
  requireString(body.timezone, 'timezone', 'INVALID_RESOURCE');
  requireInteger(body.slot_granularity_minutes, 'slot_granularity_minutes', {
    min: 1,
    code: 'INVALID_RESOURCE'
  });
  requireInteger(body.min_duration_minutes, 'min_duration_minutes', {
    min: 1,
    code: 'INVALID_RESOURCE'
  });
  requireInteger(body.max_duration_minutes, 'max_duration_minutes', {
    min: 1,
    code: 'INVALID_RESOURCE'
  });
}

export function validateCreateItemBody(body) {
  requireObject(body, 'INVALID_ITEM');
  requireString(body.tenant_id, 'tenant_id', 'INVALID_ITEM');
  requireString(body.name, 'name', 'INVALID_ITEM');
  requireInteger(body.total_quantity, 'total_quantity', { min: 0, code: 'INVALID_ITEM' });
}

export function validateCreateHoldBody(body) {
  requireObject(body, 'INVALID_HOLD_REQUEST');
  requireString(body.tenant_id, 'tenant_id', 'INVALID_HOLD_REQUEST');
  requireString(body.created_by_user_id, 'created_by_user_id', 'INVALID_HOLD_REQUEST');
  requireInteger(body.expires_in_seconds, 'expires_in_seconds', {
    min: 60,
    max: 3600,
    code: 'INVALID_HOLD_REQUEST'
  });
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 10) {
    throw new DomainError('INVALID_HOLD_REQUEST', 'lines must be array in [1,10]', 400);
  }
}

export function validateConfirmBody(body) {
  requireObject(body, 'INVALID_CONFIRM_REQUEST');
}

export function validateCancelBody(body, code = 'INVALID_CANCEL_REQUEST') {
  requireObject(body, code);
  if (body.actor_user_id !== undefined) {
    requireString(body.actor_user_id, 'actor_user_id', code);
  }
  optionalBoolean(body.is_admin, 'is_admin', code);
}

export function validateResourceAvailabilityQuery(query) {
  requireDateTime(query.start_at, 'start_at', 'INVALID_RANGE');
  requireDateTime(query.end_at, 'end_at', 'INVALID_RANGE');
  if (query.granularity_minutes !== undefined) {
    requireInteger(query.granularity_minutes, 'granularity_minutes', { min: 1, code: 'INVALID_RANGE' });
  }
}
