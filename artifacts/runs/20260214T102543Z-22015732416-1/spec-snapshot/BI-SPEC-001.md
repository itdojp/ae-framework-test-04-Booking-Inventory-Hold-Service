# BI-SPEC-001 予約・在庫確保サービス仕様（Issue #1 転記）

- 転記元: https://github.com/itdojp/ae-framework-test-04-Booking-Inventory-Hold-Service/issues/1
- 転記日時: 2026-02-14T00:18:17Z

# 仕様書 予約・在庫確保サービス（Booking / Inventory Hold）

## 1. 文書メタ

* 文書ID: **BI-SPEC-001**
* タイトル: **Booking / Inventory Hold Service 仕様**
* 版: **v0.9（実装用ドラフト）**
* 想定実装: REST API + 最小Web UI + バッチ（期限切れ処理）
* 対象テナント方式: マルチテナント（tenant_idで完全分離）

---

## 2. 目的・背景

### 2.1 目的

* **時間枠予約（Booking）** と **数量在庫確保（Inventory Hold）** を同一の概念（Hold→Confirm）で扱い、

  * **二重予約/過剰引当の防止**
  * **期限付き仮押さえ（Hold）の導入**
  * **確定（Confirm）と取消（Cancel）/期限切れ（Expire）**
    を API と UI で提供する。

### 2.2 成果（ae-framework有用性の示し方）

* 状態遷移（Hold/Confirm/Cancel/Expire）を **MBT** で網羅し、mutation でテスト強度を可視化する。 ([GitHub][1])
* 並行実行（同時Hold/同時Confirm）に対して、**形式検証（例: CSP/TLA+）** で「二重確保が起きない」不変条件を示す。 ([GitHub][1])

---

## 3. スコープ

### 3.1 スコープ内

* 予約対象（リソース）管理

  * 時間枠型リソース（例: 会議室）
  * 在庫数量型アイテム（例: プロジェクタ 5台）
* Hold（仮押さえ）作成・参照・取消・期限切れ
* Hold 確定（Confirm）→ Booking/InventoryReservation 生成
* 可用性（availability）の照会
* 最小UI（操作確認用）
* 監査ログ（Audit Log）
* 認可（RBAC）とポリシー評価（OPA等は任意だが、入力/出力の形は定義する）

### 3.2 スコープ外（v0ではやらない）

* 決済連携
* 外部カレンダー同期
* 複雑な繰り返し予約（週次など）
* 需要予測、レコメンド

---

## 4. 用語

* **Tenant**: 組織/顧客の分離単位
* **Resource**: 時間枠で占有される対象（会議室等）
* **InventoryItem**: 数量で引当される対象（備品等）
* **Hold**: 期限付き仮押さえ（複数の明細を持てる）
* **HoldLine**: Holdの明細（ResourceSlot または InventoryQty）
* **Confirm**: Holdを確定し、Booking/InventoryReservation に変換する操作
* **Booking**: 時間枠リソースの確定予約
* **InventoryReservation**: 在庫数量の確定引当
* **Overlap**: 時間枠が重複すること（[start,end)で判定）

---

## 5. 主要ユースケース

* UC-BI-01: 可用性を見て、会議室を仮押さえする
* UC-BI-02: 備品（数量）を仮押さえする
* UC-BI-03: Holdを確定し、予約/引当を確定する
* UC-BI-04: Holdを取り消す（期限前）
* UC-BI-05: Holdが期限切れで自動キャンセルされる
* UC-BI-06: 確定した予約をキャンセルする（権限付き）
* UC-BI-07: 監査ログで「いつ誰が何をしたか」を追える

---

## 6. ドメインモデル（データ）

### 6.1 エンティティ一覧

#### Tenant

* tenant_id: string（ULID/UUID）
* name: string

#### User（ID連携は外部でも良いが、ローカル表現を置く）

* user_id: string
* tenant_id: string
* display_name: string
* role: enum { ADMIN, MEMBER, VIEWER }

#### Resource（時間枠型）

* resource_id: string
* tenant_id: string
* name: string
* timezone: string（IANA）
* slot_granularity_minutes: int（例: 15）
* min_duration_minutes: int（例: 15）
* max_duration_minutes: int（例: 240）
* bookable_hours: 例）平日9-18（v0では簡易でも可）
* status: enum { ACTIVE, INACTIVE }

#### InventoryItem（数量型）

* item_id: string
* tenant_id: string
* name: string
* total_quantity: int（>=0）
* status: enum { ACTIVE, INACTIVE }

#### Hold

* hold_id: string
* tenant_id: string
* created_by_user_id: string
* status: enum { ACTIVE, CONFIRMED, CANCELLED, EXPIRED }
* expires_at: datetime（UTC）
* created_at: datetime（UTC）
* updated_at: datetime（UTC）
* confirmed_at: datetime|null
* cancelled_at: datetime|null
* expired_at: datetime|null
* idempotency_key: string|null（作成系で利用）
* note: string|null

#### HoldLine

* hold_line_id: string
* hold_id: string
* kind: enum { RESOURCE_SLOT, INVENTORY_QTY }
* resource_id: string|null
* start_at: datetime|null（UTC）
* end_at: datetime|null（UTC）
* item_id: string|null
* quantity: int|null
* status: enum { ACTIVE, RELEASED }

  * RELEASED は Confirm/Cancel/Expire により解放されたことを示す（行単位の追跡用）
* conflict_key: string（ユニーク制約/ロック単位に使う派生キー）

  * RESOURCE_SLOT: `resource_id + start_at + end_at` から生成（実装に依存）
  * INVENTORY_QTY: `item_id` を基本単位にする

#### Booking（確定予約：時間枠）

* booking_id: string
* tenant_id: string
* resource_id: string
* start_at: datetime
* end_at: datetime
* created_by_user_id: string
* status: enum { CONFIRMED, CANCELLED }
* source_hold_id: string|null
* created_at, updated_at
* cancelled_at: datetime|null

#### InventoryReservation（確定引当：数量）

* reservation_id: string
* tenant_id: string
* item_id: string
* quantity: int
* created_by_user_id: string
* status: enum { CONFIRMED, CANCELLED }
* source_hold_id: string|null
* created_at, updated_at
* cancelled_at: datetime|null

#### AuditLog

* audit_id: string
* tenant_id: string
* actor_user_id: string|null（systemの場合null）
* action: string（例: HOLD_CREATE, HOLD_CONFIRM）
* target_type: string（HOLD / BOOKING / ITEM 等）
* target_id: string
* payload: JSON（差分、理由、入力）
* created_at: datetime

---

## 7. 状態遷移（State Machine）

### 7.1 Hold 状態遷移

| 現在                | 操作             | 遷移先               | 条件                            |
| ----------------- | -------------- | ----------------- | ----------------------------- |
| ACTIVE            | confirm        | CONFIRMED         | expires_at > now、かつ全lineが確保可能 |
| ACTIVE            | cancel         | CANCELLED         | 作成者またはADMIN                   |
| ACTIVE            | expire（バッチ）    | EXPIRED           | now >= expires_at             |
| CONFIRMED         | cancel         | （禁止/または別の「予約取消」へ） | Hold自体は変更しない設計推奨              |
| CANCELLED/EXPIRED | confirm/cancel | 失敗                | 409                           |

**BI-INV-001（不変条件）**: `status in {CANCELLED, EXPIRED}` の Hold はリソース/在庫を確保していない（すべてのHoldLineはRELEASED）。
**BI-INV-002**: `CONFIRMED` の Hold は必ず Booking/InventoryReservation を生成済み（source_hold_idで追跡可能）。

### 7.2 Booking 状態遷移

* CONFIRMED → CANCELLED（取消権限がある場合のみ）
* CANCELLED は終端

### 7.3 InventoryReservation 状態遷移

* CONFIRMED → CANCELLED（取消権限がある場合のみ）
* CANCELLED は終端

---

## 8. 可用性（Availability）の定義

### 8.1 時間枠型（Resource）

ある時間枠 [start_at, end_at) が **available** である条件:

* 同一resource_idに対し、

  * CONFIRMED Booking の overlap が **存在しない**
  * ACTIVE HoldLine(RESOURCE_SLOT) の overlap が **存在しない**

    * ただし、「自分のHold（hold_id指定時）」は除外可能

Overlap判定: `[a_start, a_end)` と `[b_start, b_end)` が重なるのは `a_start < b_end && b_start < a_end`

### 8.2 数量型（InventoryItem）

時刻非依存（v0）で available_quantity を定義:

```
available_quantity =
  total_quantity
  - sum(CONFIRMED InventoryReservation.quantity)
  - sum(ACTIVE HoldLine(INVENTORY_QTY).quantity)
```

**BI-INV-010（不変条件）**: 常に `available_quantity >= 0`

---

## 9. 認証・認可

### 9.1 認証

* APIは Bearer Token（JWT等）を前提（v0ではモックでも可）
* Token から tenant_id, user_id, role を取得する想定

### 9.2 認可（RBAC）

* VIEWER: 読み取りのみ
* MEMBER: 自分のHold作成/取消/確定、可用性照会
* ADMIN: 全操作、強制キャンセル、リソース/在庫管理

**BI-AUTH-001**: tenant_id が一致しない対象へのアクセスは 404（情報漏えい防止）
**BI-AUTH-002**: 自分以外のHoldを cancel できるのは ADMIN のみ

（任意）OPA連携する場合の入力/出力形:

* input: `{tenant_id, user, action, resource, context}`
* output: `{allow: bool, reason: string, obligations?: []}`

---

## 10. API 仕様（REST）

### 10.1 共通

* Base: `/api/v1`
* Content-Type: `application/json`
* 時刻: ISO 8601 UTC（例: `2026-02-12T10:00:00Z`）
* 監査/相関:

  * Request header: `X-Request-Id`（任意、あればログに残す）
* Idempotency（作成/確定系）:

  * Request header: `Idempotency-Key`（同一キー+同一ユーザ+同一テナントで再送時に同一結果）

### 10.2 エラー形式（共通）

```json
{
  "error": {
    "code": "HOLD_EXPIRED",
    "message": "Hold is expired",
    "details": { "hold_id": "..." }
  }
}
```

* HTTPステータス使い分け:

  * 400: バリデーション
  * 401: 未認証
  * 403: 認可NG
  * 404: 存在しない（または他テナント）
  * 409: 競合（重複予約、在庫不足、状態遷移不可）
  * 422: ドメインルール違反（任意、400/409でも可）

---

### 10.3 リソース管理

#### GET /resources

* 説明: Resource一覧
* クエリ: `status=ACTIVE|INACTIVE`（任意）
* レスポンス: `[Resource]`

#### POST /resources（ADMIN）

* Resource作成

#### PATCH /resources/{resource_id}（ADMIN）

* name/status/制約の更新

---

### 10.4 在庫管理

#### GET /items

* InventoryItem一覧

#### POST /items（ADMIN）

* 作成

#### PATCH /items/{item_id}（ADMIN）

* total_quantity の変更（>=0）
* **BI-RULE-ITEM-001**: total_quantity を下げる場合、既存確保量（confirmed + active holds）未満にしてはならない（409）

---

### 10.5 可用性照会

#### GET /resources/{resource_id}/availability

* クエリ:

  * `start_at`（必須）
  * `end_at`（必須）
  * `granularity_minutes`（任意、未指定はresourceのslot_granularity）
  * `exclude_hold_id`（任意：自分のhold表示用）
* レスポンス例:

```json
{
  "resource_id": "R1",
  "range": { "start_at": "...", "end_at": "..." },
  "slots": [
    { "start_at": "...", "end_at": "...", "available": true, "reason": null },
    { "start_at": "...", "end_at": "...", "available": false, "reason": "BOOKED" }
  ]
}
```

#### GET /items/{item_id}/availability

* レスポンス:

```json
{
  "item_id": "I1",
  "total_quantity": 5,
  "reserved_confirmed": 2,
  "reserved_holds": 1,
  "available_quantity": 2
}
```

---

### 10.6 Hold（仮押さえ）

#### POST /holds

* 説明: Hold作成（複数lineをまとめて確保）
* ヘッダ: `Idempotency-Key` 推奨
* リクエスト:

```json
{
  "expires_in_seconds": 600,
  "note": "optional",
  "lines": [
    {
      "kind": "RESOURCE_SLOT",
      "resource_id": "R1",
      "start_at": "2026-02-12T10:00:00Z",
      "end_at": "2026-02-12T11:00:00Z"
    },
    {
      "kind": "INVENTORY_QTY",
      "item_id": "I1",
      "quantity": 2
    }
  ]
}
```

* ルール:

  * **BI-HOLD-001**: expires_in_seconds は [60, 3600] の範囲（v0推奨）
  * **BI-HOLD-002**: lines は 1..10
  * **BI-HOLD-003**: ResourceSlotは resource の granularity に整列していること（400）
  * **BI-HOLD-004**: ResourceSlotは min/max duration を満たす（400）
  * **BI-HOLD-005**: InventoryQty.quantity は 1..max（maxは任意だが例: 100）
  * **BI-HOLD-010**: 全lineを **同一トランザクションで** 確保できなければ 409 で全体失敗（部分成功なし）
* レスポンス:

  * 201: Hold（status=ACTIVE）

#### GET /holds/{hold_id}

* 説明: Hold詳細（自分またはADMIN）
* レスポンス: Hold + lines

#### POST /holds/{hold_id}/confirm

* 説明: Hold確定（Booking/InventoryReservationを生成）
* ルール:

  * **BI-CONFIRM-001**: Hold.status==ACTIVE のみ
  * **BI-CONFIRM-002**: now < expires_at のみ（期限後は 409 HOLD_EXPIRED）
  * **BI-CONFIRM-003**: confirm は冪等（同一hold_idの再実行は同一結果を返すか、409ではなく200で返す方針推奨）
  * **BI-CONFIRM-010**: 確定時点で競合が発生していた場合（理論上は発生しない設計が目標だが）409
* レスポンス例:

```json
{
  "hold_id": "H1",
  "status": "CONFIRMED",
  "bookings": [
    { "booking_id": "B1", "resource_id": "R1", "start_at": "...", "end_at": "...", "status": "CONFIRMED" }
  ],
  "reservations": [
    { "reservation_id": "S1", "item_id": "I1", "quantity": 2, "status": "CONFIRMED" }
  ]
}
```

#### POST /holds/{hold_id}/cancel

* 説明: Hold取消（解放）
* ルール:

  * ACTIVEのみ
  * 作成者またはADMIN
* レスポンス: Hold（status=CANCELLED）

---

### 10.7 Booking/Reservation 参照・取消

#### GET /bookings

* クエリ: `resource_id`, `start_at`, `end_at`, `status`
* レスポンス: Booking[]（ページング任意）

#### POST /bookings/{booking_id}/cancel

* ルール:

  * ADMIN は常に可能
  * MEMBER は自分が作成した booking のみ可能（運用次第で制限）
* レスポンス: Booking（CANCELLED）

#### GET /reservations

* item_id 等で検索

#### POST /reservations/{reservation_id}/cancel

* 同上

---

## 11. 競合制御・整合性設計（必須要件）

**BI-CC-001**: 二重予約/過剰引当を防ぐため、少なくとも次のいずれかを満たすこと（実装は選択可）

* DBの排他制御（`SELECT ... FOR UPDATE` など） + 集計
* 予約テーブルに対する重複禁止制約（時間枠は難しいため、補助テーブルを設ける等）
* アプリケーションロック（例: resource_id単位 / item_id単位）

**BI-CC-002**: Hold作成・Confirm・Cancel・Expire は **監査ログに必ず記録**する

**BI-CC-003**: 同一Holdに対する同時confirm（2リクエスト同時）でも、

* Booking/Reservation は二重生成されない
* 結果は冪等（片方は成功、片方は同一結果返却）
  を満たす

---

## 12. バッチ（期限切れ処理）

### 12.1 Hold Expirer

* 実行頻度: 1分毎（v0）
* 対象: `status=ACTIVE && expires_at <= now`
* 処理:

  * Hold.status→EXPIRED
  * HoldLine.status→RELEASED
  * AuditLog: HOLD_EXPIRE(system)
* 冪等: 同一hold_idを複数回処理しても問題ないこと

---

## 13. 最小UI仕様（検証用）

### 13.1 画面

* UI-BI-01: リソース一覧 / 在庫一覧
* UI-BI-02: リソースの可用性（簡易カレンダー/タイムライン）
* UI-BI-03: Hold作成フォーム（resource slot / item qty の追加）
* UI-BI-04: Hold詳細（confirm/cancelボタン）
* UI-BI-05: Booking/Reservation一覧

### 13.2 UI非機能（最低限）

* UI-BI-NFR-001: 主要操作は3クリック以内（目安）
* UI-BI-NFR-002: APIエラーは code/message を表示

---

## 14. 検証（ae-framework向け）

ae-framework の想定パイプライン（mutation/MBT/property/形式検証）に接続するための、**検証ターゲット定義**。 ([GitHub][1])

### 14.1 MBT（モデルベーステスト）モデル（要点）

* 状態: Hold.status ×（lines有無）×（期限内/期限切れ）
* 操作: create_hold, confirm, cancel, expire_tick, get
* 期待:

  * 遷移表にない遷移は必ず 409
  * confirm 後に booking/reservation が生成され、重複しない
  * expire 後は確保が解放される

### 14.2 Property（不変条件）テスト候補

* P-BI-01: 任意時点で各Resourceについて、同一時間枠に overlap する CONFIRMED Booking が複数存在しない
* P-BI-02: 任意時点で各InventoryItemについて、(confirmed + active holds) <= total_quantity
* P-BI-03: Holdが終端（CANCELLED/EXPIRED）なら、hold_lines はすべて RELEASED
* P-BI-04: confirm は冪等

### 14.3 形式仕様（CSP/TLA+）の最小スコープ

* 2クライアントが同じ resource_id へ同時に hold→confirm を行うモデル
* 安全性（Safety）:

  * 二重確定が起きない
  * 期限切れholdは確定できない
* 活性（Liveness）:（任意）

  * 期限切れ処理が走れば、いずれ active holds は解放される

### 14.4 Mutation testing 観点

* Availability判定の境界（< と <= を入れ替えた変異）
* quantity の加減算
* expires_at 判定の逆転
  これらがテストで殺せること

---

## 15. 受入基準（サマリ）

* BI-ACC-01: 同じ会議室・同じ時間枠に対して同時に hold→confirm を叩いても、確定予約は1件だけ
* BI-ACC-02: 在庫5に対し、hold(4)とhold(2)は片方が必ず失敗（409）
* BI-ACC-03: expires_at を過ぎた hold は confirm できず 409
* BI-ACC-04: バッチ実行後、期限切れholdは availability に影響しない

---
[1]: https://github.com/itdojp/ae-framework "https://github.com/itdojp/ae-framework"
