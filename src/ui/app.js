const state = {
  lines: []
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
      await loadHolds();
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });
  li.querySelector('.cancel-hold').addEventListener('click', async () => {
    try {
      const actor = byId('ctx-user').value.trim();
      await api(`/holds/${hold.hold_id}/cancel`, {
        method: 'POST',
        body: actor ? { actor_user_id: actor } : {}
      });
      await loadHolds();
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
    list.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${row.name}</strong><div class="meta">${row.resource_id} / ${row.status}</div>`;
      list.appendChild(li);
    }
  } catch {
    list.textContent = 'failed';
  }
}

async function loadItems() {
  const list = byId('items-list');
  list.textContent = 'loading...';
  try {
    const rows = await api('/items');
    list.innerHTML = '';
    for (const row of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${row.name}</strong><div class="meta">${row.item_id} / qty=${row.total_quantity}</div>`;
      list.appendChild(li);
    }
  } catch {
    list.textContent = 'failed';
  }
}

async function loadHolds() {
  const list = byId('holds-list');
  list.textContent = 'loading...';
  const params = new URLSearchParams();
  const status = byId('holds-status').value;
  if (status) params.set('status', status);
  try {
    const rows = await api(`/holds${params.size ? `?${params}` : ''}`);
    list.innerHTML = '';
    for (const row of rows) {
      list.appendChild(createHoldEntry(row));
    }
  } catch {
    list.textContent = 'failed';
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
      await loadHolds();
    } catch (error) {
      jsonView({ error: { message: error.message } });
    }
  });

  byId('refresh-resources').addEventListener('click', loadResources);
  byId('refresh-items').addEventListener('click', loadItems);
  byId('refresh-holds').addEventListener('click', loadHolds);

  loadResources();
  loadItems();
  loadHolds();
}

setup();
