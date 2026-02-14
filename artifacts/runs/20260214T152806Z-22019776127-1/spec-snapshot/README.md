# Specification Assets

Issue #1（`BI-SPEC-001`）を機械可読で運用するための仕様群。

## Files

- `spec/BI-SPEC-001.md`: Issue #1 転記元の本文
- `spec/openapi/booking-inventory-hold.openapi.yaml`: REST API 契約
- `spec/state-machines/hold-state-machine.json`: Hold 状態遷移
- `spec/state-machines/booking-state-machine.json`: Booking 状態遷移
- `spec/state-machines/reservation-state-machine.json`: Reservation 状態遷移
- `spec/formal/bi-hold.formal-plan.json`: 形式検証計画
- `spec/formal/smt/bi-hold-invariants.smt2`: SMT 入力（不変条件シード）
- `spec/flow/bi-hold.flow.json`: ae-flow 定義
