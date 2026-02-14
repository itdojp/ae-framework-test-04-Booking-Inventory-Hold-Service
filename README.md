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
```
