# ae-framework 利用仕様（初版）

## 1. 目的

Booking / Inventory Hold Service 開発で利用する `ae-framework` ツール群と、自動化・成果物保存の運用仕様を定義する。

## 2. 前提条件

- Node.js: `>=20.11 <23`
- pnpm: `10.x`
- CI: GitHub Actions
- 参照根拠:
  - `ae-framework/README.md`
  - `ae-framework/docs/product/PRODUCT-FIT-INPUT-OUTPUT-TOOL-MAP.md`
  - `ae-framework/docs/integrations/CODEX-INTEGRATION.md`

## 3. 利用ツール選定

| 区分 | 利用コマンド（ae-framework） | 採用理由 | 主な出力 |
| --- | --- | --- | --- |
| 仕様検証 | `pnpm run spec:validate` | 仕様不備の早期検知 | `.ae/`, 検証ログ |
| 仕様コンパイル | `pnpm run spec:compile` | 仕様の機械可読化（SSOT） | `.ae/ae-ir.json` |
| 軽量品質ゲート | `pnpm run verify:lite` | PR 単位の最低品質保証 | `artifacts/verify-lite/*.json` |
| Mutation（軽量） | `pnpm run pipelines:mutation:quick` | 状態遷移・境界条件のテスト強度評価 | `artifacts/mutation/**` |
| Conformance | `pnpm run conformance:verify:sample`（設定差替） | 不変条件違反の検出と可視化 | `artifacts/hermetic-reports/conformance/**` |
| 形式検証（並行性） | `pnpm run verify:csp`, `pnpm run verify:tla` | 二重確保防止など安全性検証 | `artifacts/hermetic-reports/formal/**` |
| 総合実行（軽量） | `pnpm run codex:run` | setup→qa→spec をプレイブック化 | `artifacts/ae/**`, `artifacts/ae/context.json` |
| トレンド分析 | `node scripts/pipelines/compare-test-trends.mjs --json-output reports/heavy-test-trends.json` | 継続的な品質劣化の検知 | `reports/heavy-test-trends.json` |
| run集計サマリ | `node scripts/generate-run-summary.mjs` | run蓄積状況と証跡量の継続監視 | `reports/ae-framework-runs-summary.{json,md}` |

## 4. 自動化運用方針

### 4.1 実行モデル

- 方針: 「人手起動を最小化し、CI と playbook を起点に実行」。
- 実行場所:
  - ローカル: 開発者検証（任意）
  - CI: `main` push / PR / schedule / manual dispatch

### 4.2 CI 自動化仕様

- Workflow: `.github/workflows/ae-framework-autopilot.yml`
- 実行内容:
  - `ae-framework` リポジトリを CI 内で取得
  - `pnpm install` + `pnpm run build`
  - `pnpm run codex:run` を実行（失敗時も証跡収集は継続）
  - 形式検証の軽量スモーク（CSP typecheck）
- 生成物を本リポジトリ `artifacts/runs/<run-id>/` へ集約
  - 集約後に `reports/ae-framework-runs-summary.{json,md}` を自動更新

### 4.3 非ブロッキング方針

- 初期フェーズでは形式検証・一部重い検証を `continue-on-error` で運用し、
  実装進行を阻害せず観測データを蓄積する。

## 5. 生成物保存仕様（GitHub 永続化）

### 5.1 保存対象

- `.ae/**`
- `artifacts/**`
- `reports/**`
- `spec/**`（仕様ソース）

### 5.2 保存ルール

- 1 実行 1 ディレクトリ: `artifacts/runs/<UTC>-<run_id>-<attempt>/`
- 各 run に `run-manifest.json` を必須配置。
- Workflow 実行後、`main` では run 生成物を自動コミットし GitHub に保存。
- PR ではコミットせず、Actions Artifact として保存。

### 5.3 run-manifest 最低項目

- `generatedAt`（UTC）
- `workflow`
- `runId` / `runAttempt`
- `source`（owner/repo@sha）
- `toolchain`（node / pnpm / ae-framework ref）
- `paths`（収集先）

## 6. 本仕様の更新条件

以下のいずれかが発生した場合に本仕様を更新する。

- 利用ツールの追加/廃止
- 生成物保存先や保持方針の変更
- CI 実行モード（blocking/non-blocking）の変更

## 7. 機械可読仕様（P1初版）

- OpenAPI: `spec/openapi/booking-inventory-hold.openapi.yaml`
- State Machine:
  - `spec/state-machines/hold-state-machine.json`
  - `spec/state-machines/booking-state-machine.json`
  - `spec/state-machines/reservation-state-machine.json`
- Formal plan: `spec/formal/bi-hold.formal-plan.json`
- Flow: `spec/flow/bi-hold.flow.json`
- Conformance sample: `configs/conformance/bi-sample-*.json`

## 8. 実装・検証の現状（P2先行）

- 実装:
  - ドメイン: `src/domain/booking-inventory-engine.js`
  - API: `src/server.js`
  - 永続化: `src/infra/json-state-store.js`（`STATE_FILE`）
- ローカル検証:
  - `npm test`
  - `./scripts/validate-spec-assets.sh`
  - `npm run report:runs`
- CI:
  - `ae-framework-autopilot` で spec検証 + `npm test` + ae-framework playbook を実行
  - runアーカイブ後に `reports/ae-framework-runs-summary.{json,md}` を再生成して保存
