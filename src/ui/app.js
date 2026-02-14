const state = {
  lines: [],
  resources: [],
  items: []
};

function byId(id) {
  return document.getElementById(id);
}

function jsonView(value) {
  byId('response-view').textContent = JSON.stringify(value, null, 2);
}

function requestContextHeaders() {
  const tenant = byId('ctx-tenant').value.trim();
  const user = byId('ctx-user').value.trim();
  const role = byId('ctx-role').value.trim();
  const requestId = byId('ctx-request-id').value.trim();
  const headers = {};
  if (tenant) headers['x-tenant-id'] = tenant;
  if (user) headers['x-user-id'] = user;
  if (role) headers['x-user-role'] = role;
  if (requestId) headers['x-request-id'] = requestId;
  return headers;
}

function actorBody() {
  const actor = byId('ctx-user').value.trim();
  return actor ? { actor_user_id: actor } : {};
}

function toQueryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  return query.toString();
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {
    ...requestContextHeaders()
  };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    jsonView(payload);
    throw new Error(payload?.error?.message ?? `request failed: ${res.status}`);
  }
  jsonView(payload);
  return payload;
}

function lineTemplate(index, line = {}) {
  const kind = line.kind ?? 'INVENTORY_QTY';
  return `
    <div class="line-item" data-index="${index}">
      <div class="grid grid-4">
        <label>kind
          <select class="line-kind">
            <option value="INVENTORY_QTY" ${kind === 'INVENTORY_QTY' ? 'selected' : ''}>INVENTORY_QTY</option>
            <option value="RESOURCE_SLOT" ${kind === 'RESOURCE_SLOT' ? 'selected' : ''}>RESOURCE_SLOT</option>
          </select>
        </label>
        <label>item_id
          <input class="line-item-id" value="${line.item_id ?? ''}" />
        </label>
        <label>quantity
          <input class="line-quantity" type="number" min="1" value="${line.quantity ?? 1}" />
        </label>
        <label>resource_id
          <input class="line-resource-id" value="${line.resource_id ?? ''}" />
        </label>
      </div>
      <div class="grid grid-4">
        <label>start_at
          <input class="line-start-at" placeholder="2026-02-14T10:00:00Z" value="${line.start_at ?? ''}" />
        </label>
        <label>end_at
          <input class="line-end-at" placeholder="2026-02-14T11:00:00Z" value="${line.end_at ?? ''}" />
        </label>
        <div></div>
        <div class="actions">
          <button type="button" class="ghost remove-line">Remove</button>
        </div>
      </div>
    </div>
  `;
}

function syncLinesFromDom() {
  const items = Array.from(document.querySelectorAll('.line-item'));
  state.lines = items.map((el) => ({
    kind: el.querySelector('.line-kind').value,
    item_id: el.querySelector('.line-item-id').value.trim(),
    quantity: Number(el.querySelector('.line-quantity').value),
    resource_id: el.querySelector('.line-resource-id').value.trim(),
    start_at: el.querySelector('.line-start-at').value.trim(),
    end_at: el.querySelector('.line-end-at').value.trim()
  }));
}

function renderLines() {
  const wrap = byId('lines-wrap');
  wrap.innerHTML = state.lines.map((line, index) => lineTemplate(index, line)).join('');
  wrap.querySelectorAll('.remove-line').forEach((button) => {
    button.addEventListener('click', () => {
      const parent = button.closest('.line-item');
      const index = Number(parent.dataset.index);
      state.lines.splice(index, 1);
      renderLines();
    });
  });
}

function toApiLine(line) {
  if (line.kind === 'RESOURCE_SLOT') {
    return {
      kind: 'RESOURCE_SLOT',
      resource_id: line.resource_id,
      start_at: line.start_at,
      end_at: line.end_at
    };
  }
  return {
    kind: 'INVENTORY_QTY',
    item_id: line.item_id,
    quantity: line.quantity
  };
}

function applyDefaultTargets() {
  if (!byId('av-resource-id').value && state.resources[0]) {
    byId('av-resource-id').value = state.resources[0].resource_id;
  }
  if (!byId('av-item-id').value && state.items[0]) {
    byId('av-item-id').value = state.items[0].item_id;
  }
}

function createHoldEntry(hold) {
  const li = document.createElement('li');
  li.innerHTML = `
    <div><strong>${hold.hold_id}</strong> <span>${hold.status}</span></div>
    <div class="meta">tenant=${hold.tenant_id} owner=${hold.created_by_user_id} expires=${hold.expires_at}</div>
    <div class="actions">
      <button class="ghost show-hold">Detail</button>
      <button class="ghost confirm-hold">Confirm</button>
      <button class="ghost cancel-hold">Cancel</button>
    </div>
  `;

  li.querySelector('.show-hold').addEventListener('click', async () => {
    try {
      const detail = await api(`/holds/${hold.hold_id}`);
      jsonView(detail);
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });

  li.querySelector('.confirm-hold').addEventListener('click', async () => {
    try {
      await api(`/holds/${hold.hold_id}/confirm`, { method: 'POST', body: {} });
      await Promise.all([loadHolds(), loadBookings(), loadReservations()]);
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });

  li.querySelector('.cancel-hold').addEventListener('click', async () => {
    try {
      await api(`/holds/${hold.hold_id}/cancel`, {
        method: 'POST',
        body: actorBody()
      });
      await Promise.all([loadHolds(), loadBookings(), loadReservations()]);
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });

  return li;
}

function createBookingEntry(booking) {
  const li = document.createElement('li');
  li.innerHTML = `
    <div><strong>${booking.booking_id}</strong> <span>${booking.status}</span></div>
    <div class="meta">resource=${booking.resource_id} ${booking.start_at} - ${booking.end_at}</div>
    <div class="actions">
      <button class="ghost cancel-booking" ${booking.status === 'CANCELLED' ? 'disabled' : ''}>Cancel</button>
    </div>
  `;
  const cancelButton = li.querySelector('.cancel-booking');
  cancelButton.addEventListener('click', async () => {
    try {
      await api(`/bookings/${booking.booking_id}/cancel`, {
        method: 'POST',
        body: actorBody()
      });
      await loadBookings();
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });
  return li;
}

function createReservationEntry(reservation) {
  const li = document.createElement('li');
  li.innerHTML = `
    <div><strong>${reservation.reservation_id}</strong> <span>${reservation.status}</span></div>
    <div class="meta">item=${reservation.item_id} qty=${reservation.quantity}</div>
    <div class="actions">
      <button class="ghost cancel-reservation" ${reservation.status === 'CANCELLED' ? 'disabled' : ''}>Cancel</button>
    </div>
  `;
  const cancelButton = li.querySelector('.cancel-reservation');
  cancelButton.addEventListener('click', async () => {
    try {
      await api(`/reservations/${reservation.reservation_id}/cancel`, {
        method: 'POST',
        body: actorBody()
      });
      await loadReservations();
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });
  return li;
}

async function loadResources() {
  const list = byId('resources-list');
  list.textContent = 'loading...';
  try {
    const rows = await api('/resources');
    state.resources = rows;
    list.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${row.name}</strong><div class="meta">${row.resource_id} / ${row.status}</div>`;
      list.appendChild(li);
    }
    applyDefaultTargets();
  } catch {
    list.textContent = 'failed';
  }
}

async function loadItems() {
  const list = byId('items-list');
  list.textContent = 'loading...';
  try {
    const rows = await api('/items');
    state.items = rows;
    list.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${row.name}</strong><div class="meta">${row.item_id} / qty=${row.total_quantity}</div>`;
      list.appendChild(li);
    }
    applyDefaultTargets();
  } catch {
    list.textContent = 'failed';
  }
}

async function loadHolds() {
  const list = byId('holds-list');
  list.textContent = 'loading...';
  const query = toQueryString({ status: byId('holds-status').value });
  try {
    const rows = await api(`/holds${query ? `?${query}` : ''}`);
    list.innerHTML = '';
    for (const row of rows) {
      list.appendChild(createHoldEntry(row));
    }
  } catch {
    list.textContent = 'failed';
  }
}

async function loadBookings() {
  const list = byId('bookings-list');
  list.textContent = 'loading...';
  const query = toQueryString({ status: byId('bookings-status').value });
  try {
    const rows = await api(`/bookings${query ? `?${query}` : ''}`);
    list.innerHTML = '';
    for (const row of rows) {
      list.appendChild(createBookingEntry(row));
    }
  } catch {
    list.textContent = 'failed';
  }
}

async function loadReservations() {
  const list = byId('reservations-list');
  list.textContent = 'loading...';
  const query = toQueryString({ status: byId('reservations-status').value });
  try {
    const rows = await api(`/reservations${query ? `?${query}` : ''}`);
    list.innerHTML = '';
    for (const row of rows) {
      list.appendChild(createReservationEntry(row));
    }
  } catch {
    list.textContent = 'failed';
  }
}

async function checkResourceAvailability() {
  const resourceId = byId('av-resource-id').value.trim();
  const startAt = byId('av-start-at').value.trim();
  const endAt = byId('av-end-at').value.trim();
  const granularity = byId('av-granularity').value.trim();
  const list = byId('resource-availability-list');

  if (!resourceId || !startAt || !endAt) {
    jsonView({
      error: {
        code: 'INVALID_INPUT',
        message: 'resource_id, start_at, end_at are required'
      }
    });
    return;
  }

  list.textContent = 'loading...';
  const query = toQueryString({
    start_at: startAt,
    end_at: endAt,
    granularity_minutes: granularity ? Number(granularity) : undefined
  });

  try {
    const result = await api(`/resources/${encodeURIComponent(resourceId)}/availability?${query}`);
    list.innerHTML = '';
    for (const slot of result.slots ?? []) {
      const li = document.createElement('li');
      li.className = slot.available ? 'available' : 'unavailable';
      li.innerHTML = `
        <div><strong>${slot.start_at}</strong> - ${slot.end_at}</div>
        <div class="meta">available=${slot.available}${slot.reason ? ` reason=${slot.reason}` : ''}</div>
      `;
      list.appendChild(li);
    }
  } catch {
    list.textContent = 'failed';
  }
}

async function checkItemAvailability() {
  const itemId = byId('av-item-id').value.trim();
  if (!itemId) {
    jsonView({
      error: {
        code: 'INVALID_INPUT',
        message: 'item_id is required'
      }
    });
    return;
  }

  try {
    const result = await api(`/items/${encodeURIComponent(itemId)}/availability`);
    byId('item-availability-view').textContent = JSON.stringify(result, null, 2);
  } catch {
    byId('item-availability-view').textContent = 'failed';
  }
}

function setup() {
  state.lines = [{ kind: 'INVENTORY_QTY', quantity: 1 }];
  renderLines();

  byId('add-line').addEventListener('click', () => {
    syncLinesFromDom();
    state.lines.push({ kind: 'INVENTORY_QTY', quantity: 1 });
    renderLines();
  });

  byId('hold-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    syncLinesFromDom();
    const payload = {
      tenant_id: byId('hold-tenant-id').value.trim(),
      created_by_user_id: byId('hold-user-id').value.trim(),
      expires_in_seconds: Number(byId('hold-expires').value),
      note: byId('hold-note').value.trim() || undefined,
      lines: state.lines.map(toApiLine)
    };
    try {
      await api('/holds', { method: 'POST', body: payload });
      await Promise.all([loadHolds(), loadBookings(), loadReservations()]);
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });

  byId('refresh-resources').addEventListener('click', loadResources);
  byId('refresh-items').addEventListener('click', loadItems);
  byId('refresh-holds').addEventListener('click', loadHolds);
  byId('refresh-bookings').addEventListener('click', loadBookings);
  byId('refresh-reservations').addEventListener('click', loadReservations);
  byId('check-resource-availability').addEventListener('click', checkResourceAvailability);
  byId('check-item-availability').addEventListener('click', checkItemAvailability);

  Promise.all([loadResources(), loadItems(), loadHolds(), loadBookings(), loadReservations()]);
}

setup();
