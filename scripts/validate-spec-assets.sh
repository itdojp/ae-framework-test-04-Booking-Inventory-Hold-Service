#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[validate-spec-assets] start"

OPENAPI_FILE="spec/openapi/booking-inventory-hold.openapi.yaml"
HOLD_SM_FILE="spec/state-machines/hold-state-machine.json"
BOOKING_SM_FILE="spec/state-machines/booking-state-machine.json"
RESERVATION_SM_FILE="spec/state-machines/reservation-state-machine.json"
FORMAL_PLAN_FILE="spec/formal/bi-hold.formal-plan.json"
SMT_INPUT_DIR="spec/formal/smt"
FLOW_FILE="spec/flow/bi-hold.flow.json"
CONFORMANCE_RULES="configs/conformance/bi-sample-rules.json"
CONFORMANCE_DATA="configs/conformance/bi-sample-data.json"
CONFORMANCE_CTX="configs/conformance/bi-sample-context.json"
CONFORMANCE_CFG="configs/conformance/bi-sample-config.json"

for f in \
  "$OPENAPI_FILE" \
  "$HOLD_SM_FILE" \
  "$BOOKING_SM_FILE" \
  "$RESERVATION_SM_FILE" \
  "$FORMAL_PLAN_FILE" \
  "$FLOW_FILE" \
  "$CONFORMANCE_RULES" \
  "$CONFORMANCE_DATA" \
  "$CONFORMANCE_CTX" \
  "$CONFORMANCE_CFG"; do
  if [[ ! -f "$f" ]]; then
    echo "[validate-spec-assets] missing file: $f" >&2
    exit 1
  fi
done

python3 - <<'PY'
import yaml
from pathlib import Path

path = Path("spec/openapi/booking-inventory-hold.openapi.yaml")
doc = yaml.safe_load(path.read_text(encoding="utf-8"))
required_top = ["openapi", "info", "paths", "components"]
missing = [k for k in required_top if k not in doc]
if missing:
    raise SystemExit(f"[validate-spec-assets] openapi missing keys: {missing}")
if not str(doc.get("openapi", "")).startswith("3."):
    raise SystemExit("[validate-spec-assets] openapi version must start with 3.")
if "/holds" not in doc.get("paths", {}):
    raise SystemExit("[validate-spec-assets] /holds path is required")
if "/holds/{hold_id}/confirm" not in doc.get("paths", {}):
    raise SystemExit("[validate-spec-assets] /holds/{hold_id}/confirm path is required")
print("[validate-spec-assets] openapi: OK")
PY

jq -e '.schemaVersion and .id and .initial and (.states|type=="array" and length>0) and (.events|type=="array") and (.transitions|type=="array")' "$HOLD_SM_FILE" >/dev/null
jq -e '.schemaVersion and .id and .initial and (.states|type=="array" and length>0) and (.transitions|type=="array")' "$BOOKING_SM_FILE" >/dev/null
jq -e '.schemaVersion and .id and .initial and (.states|type=="array" and length>0) and (.transitions|type=="array")' "$RESERVATION_SM_FILE" >/dev/null
echo "[validate-spec-assets] state-machines: OK"

jq -e '.schemaVersion and .metadata and (.variables|type=="array" and length>0) and (.actions|type=="array" and length>0) and (.invariants|type=="array" and length>0)' "$FORMAL_PLAN_FILE" >/dev/null
echo "[validate-spec-assets] formal-plan: OK"

if [[ ! -d "$SMT_INPUT_DIR" ]]; then
  echo "[validate-spec-assets] missing directory: $SMT_INPUT_DIR" >&2
  exit 1
fi

SMT_FILE_COUNT="$(find "$SMT_INPUT_DIR" -type f -name '*.smt2' | wc -l | tr -d ' ')"
if [[ "$SMT_FILE_COUNT" -lt 1 ]]; then
  echo "[validate-spec-assets] smt-inputs: no .smt2 file under $SMT_INPUT_DIR" >&2
  exit 1
fi
echo "[validate-spec-assets] smt-inputs: OK ($SMT_FILE_COUNT files)"

jq -e '.schemaVersion and (.nodes|type=="array" and length>0) and (.edges|type=="array" and length>0)' "$FLOW_FILE" >/dev/null
echo "[validate-spec-assets] flow: OK"

jq -e 'type=="array" and length>0' "$CONFORMANCE_RULES" >/dev/null
jq -e 'type=="object"' "$CONFORMANCE_DATA" >/dev/null
jq -e 'type=="object" and .executionId and .timestamp' "$CONFORMANCE_CTX" >/dev/null
jq -e 'type=="object" and .enabled != null and .performance.timeoutMs' "$CONFORMANCE_CFG" >/dev/null
echo "[validate-spec-assets] conformance inputs: OK"

echo "[validate-spec-assets] done"
