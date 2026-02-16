# Booking / Inventory Hold Service

`ae-framework` の有用性評価を兼ねた開発リポジトリ。

## 起点

- 仕様書: ISSUE #1  
  https://github.com/itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service/issues/1
- 開発開始時実行環境: ISSUE #2  
  https://github.com/itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service/issues/2

## 参照ドキュメント

- 開発計画: `docs/plans/development-plan.md`
- ae-framework 利用仕様: `docs/specs/ae-framework-utilization-spec.md`
- 仕様資産一覧: `spec/README.md`

## 成果物保存方針

ae-framework 評価のため、以下ディレクトリ配下の中間生成物を GitHub 上に保持する。

- `.ae/`
- `artifacts/`
- `reports/`

## プロトタイプ実装（P2先行）

- ドメイン実装: `src/domain/booking-inventory-engine.js`
- 受入基準テスト: `tests/booking-inventory-engine.test.js`
- 永続化: `src/infra/json-state-store.js`（`STATE_FILE`）
- API: `src/server.js`

```bash
npm test
npm start
npm run expire:holds -- --now 2026-02-14T10:00:00Z
npm run report:runs
npm run report:evaluation
npm run report:retention-alert
npm run report:formal-alert
npm run report:evaluation-alert
CURRENT_RUN_ID=123 CURRENT_RUN_ATTEMPT=1 npm run report:validate-freshness
```

UI:

- `http://localhost:3000/ui`
- 主な機能:
  - Resource / Item 一覧
  - Hold 作成 / 一覧 / 詳細 / confirm / cancel
  - Resource / Item 可用性照会
- Booking / Reservation 一覧 / cancel

評価サマリ:

- `reports/ae-framework-runs-summary.json`
- `reports/ae-framework-runs-summary.md`
- `reports/ae-framework-evaluation.md`
- `reports/artifact-retention-review-alert.json`
- `reports/formal-regression-alert.json`
- `reports/evaluation-threshold-alert.json`
