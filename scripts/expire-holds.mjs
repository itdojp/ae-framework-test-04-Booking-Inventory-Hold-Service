#!/usr/bin/env node
import process from 'node:process';
import { BookingInventoryEngine } from '../src/domain/booking-inventory-engine.js';
import { JsonStateStore } from '../src/infra/json-state-store.js';

function parseNowArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--now') {
      return argv[index + 1] ?? null;
    }
    if (value.startsWith('--now=')) {
      return value.slice('--now='.length);
    }
  }
  return null;
}

const stateFile = process.env.STATE_FILE ?? 'data/runtime-state.json';
const nowArg = parseNowArg(process.argv.slice(2));
const now = nowArg ? new Date(nowArg) : new Date();

if (!Number.isFinite(now.getTime())) {
  console.error('invalid --now value');
  process.exit(1);
}

const store = new JsonStateStore(stateFile);
const snapshot = store.load();
const engine = new BookingInventoryEngine({ snapshot: snapshot ?? undefined });
const expired = engine.expireHolds({ now });
store.save(engine.toSnapshot());

console.log(
  JSON.stringify(
    {
      state_file: stateFile,
      now: now.toISOString(),
      expired
    },
    null,
    2
  )
);
