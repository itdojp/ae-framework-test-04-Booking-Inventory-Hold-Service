# 開発計画（初版）

## 1. 文書メタ

- 作成日: 2026-02-14
- 対象仕様: ISSUE #1（`BI-SPEC-001 v0.9`）
- 関連: ISSUE #2（開発開始時の Codex 実行環境）

## 2. 目的

本計画は、Booking / Inventory Hold Service の実装と同時に `ae-framework` の適用効果を評価するための実行計画を定義する。

## 3. フェーズ計画

| Phase | 期間（目安） | 主要作業 | 成果物 |
| --- | --- | --- | --- |
| P0: 初期化 | 2026-02-14 | Issue整理、計画/適用仕様の確定、自動化設定の初版投入 | 本計画書、利用仕様書、CI workflow |
| P1: 仕様固定 | 2026-02-14〜2026-02-17 | ISSUE #1 をリポジトリ内仕様へ転記、API契約/状態遷移の機械可読化 | `spec/BI-SPEC-001.md`, API/状態遷移定義 |
| P2: ドメイン実装 | 2026-02-17〜2026-02-24 | Hold/Confirm/Cancel/Expire、競合制御、監査ログ実装 | ドメイン層・永続化層・REST API |
| P3: UI/バッチ | 2026-02-24〜2026-02-28 | 最小 UI、期限切れバッチ、運用ログ導線 | Web UI、Expirer ジョブ |
| P4: 検証強化 | 2026-02-28〜2026-03-03 | MBT/Property/Mutation/形式検証の導入・調整 | テスト群、検証サマリ、反例レポート |
| P5: 評価報告 | 2026-03-03〜2026-03-05 | ae-framework 適用効果の定量・定性評価、残課題整理 | 評価レポート、運用手順更新 |

## 4. 受入基準（ISSUE #1 連動）

- BI-ACC-01: 同時 hold→confirm でも確定予約は 1 件のみ。
- BI-ACC-02: 在庫5で hold(4) と hold(2) は片方が 409。
- BI-ACC-03: 期限切れ hold の confirm は 409。
- BI-ACC-04: Expire バッチ後、期限切れ hold は可用性に影響しない。

## 5. ae-framework 評価観点

- 仕様運用: 仕様（Markdown）から機械可読形式への変換と差分管理。
- 品質ゲート: `verify:lite` による PR 最低品質の自動判定。
- 検証強度: mutation/MBT/property による不変条件の破壊耐性。
- 並行性保証: CSP/TLA+ による二重確保防止の安全性検証。
- 証跡管理: 中間生成物を GitHub に継続保存できる運用性。

## 6. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| 形式検証ツール不足（TLA/CSP 実行環境） | P4 遅延 | `tools:formal:check` を先行実行し、不足時は CI を非ブロッキング運用 |
| Mutation コスト増大 | CI 長時間化 | Quick モードを既定化し、Nightly に heavy を分離 |
| 生成物肥大化 | リポジトリ肥大化 | run 単位ディレクトリ化、manifest 管理、必要時に圧縮 |

## 7. 進捗記録（2026-02-14）

- P1 初版完了:
  - OpenAPI / state machine / formal plan / flow / conformance input を作成
  - 仕様検証スクリプト `scripts/validate-spec-assets.sh` を追加
- P2 先行実装:
  - `src/domain/booking-inventory-engine.js` に hold lifecycle 実装
  - `src/server.js` で最小 API を提供
  - `src/infra/json-state-store.js` によるファイル永続化を追加
  - 仕様ルール追加実装:
    - `BI-HOLD-003/004`（ResourceSlot の granularity 整列 / min-max duration）
    - `BI-RULE-ITEM-001`（`PATCH /items/{item_id}` での total_quantity 下限検証）
    - `PATCH /resources/{resource_id}` / `PATCH /items/{item_id}` を API 実装
    - hold 作成時 `Idempotency-Key` ヘッダを受理
    - `GET /api/v1/audit-logs` を追加（監査ログの検索・制限取得）
    - `X-Tenant-Id` 指定時のテナント境界制御（クロステナントは 404）
    - `X-Request-Id` を監査ログへ保存し `request_id` で検索可能化
    - `X-User-Role` 指定時の管理操作ガード（MEMBER は 403）
    - `X-User-Id` から hold/booking/reservation 操作 actor を補完
    - Hold 詳細/confirm を owner または ADMIN に制限（role context 時）
    - confirm 監査ログの actor を実行ユーザーで記録
    - 期限切れバッチ CLI `scripts/expire-holds.mjs` を追加（`STATE_FILE` を直接更新）
    - `GET /api/v1/holds` を追加（tenant/owner/status/time-range/limit フィルタ）
    - `/bookings` `/reservations` 一覧クエリの入力検証を追加（日時範囲/enum）
    - `/bookings` `/reservations` に `created_by_user_id` フィルタ追加、role context 時は non-admin を owner スコープに制限
    - 最小UIを追加（`/ui`, `/ui/app.js`, `/ui/styles.css`）
    - UI-BI-02/05 対応として、可用性照会・Booking/Reservation 一覧/取消を UI から実行可能化
    - run集計スクリプト `scripts/generate-run-summary.mjs` を追加（`reports/ae-framework-runs-summary.{json,md}`）
    - 評価レポートスクリプト `scripts/generate-evaluation-report.mjs` を追加（`reports/ae-framework-evaluation.md`）
    - SMT入力シード `spec/formal/smt/bi-hold-invariants.smt2` を追加し、run集計で project formal input として可視化
    - CI workflow に SMT smoke（`verify:smt --file spec/formal/smt/bi-hold-invariants.smt2`）を追加
    - CI workflow で SMT solver（cvc5/z3）を自動導入するステップを追加
    - CI workflow で TLA/Alloy アセット取得と smoke（`verify:tla` / `verify:alloy`）を追加
    - run summary/evaluation に latest vs previous の formal status 差分を追加
    - CI で run アーカイブ後に評価サマリを自動更新
- テスト:
  - 受入基準 + 追加ケースを `tests/booking-inventory-engine.test.js` に実装
  - API スモーク/永続化/入力検証/patch/idempotency/audit/role-guard を server テストに追加
  - バッチCLIテスト `tests/expire-holds-script.test.js` を追加
  - hold 一覧APIテスト `tests/server-holds-list.test.js` を追加
  - UI配信テスト `tests/server-ui.test.js` を追加
  - booking/reservation 取消の owner/admin ガードテストを追加
  - booking/reservation 一覧の owner スコープ制御テストを追加
  - run集計スクリプトテスト `tests/generate-run-summary-script.test.js` を追加
  - 評価レポートスクリプトテスト `tests/generate-evaluation-report-script.test.js` を追加
  - `npm test` 34/34 pass
