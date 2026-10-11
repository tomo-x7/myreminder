# クライアントの層と API の契約(#30・#31)

将来、Android の React Native(Expo)版を作るときに、web と同じ API・同じロジックをそのまま使えるようにするための約束。基本の構成(Worker 1つ+D1+Access)は変えない。

## 層

| 層 | 場所 | 中身 | 使ってよいもの |
|---|---|---|---|
| API | `worker/` | Hono のルート、計画、通知 | — |
| クライアントの共通部分 | `core/`(workspace のパッケージ) | API クライアント、TanStack Query のフックとキー、表示の規則(日付・リスク・進捗の言い方)、下書き・入力の変換と検証、エラーのコード→文言 | React(フックだけ)、TanStack Query、`hono/client`、`worker` の型 |
| web の画面 | `web/` | React DOM の画面、Tailwind、wouter のルーティング、web 固有の処理(Access の再読み込み、firebase web SDK の push、Service Worker の共有、canvas での画像の縮小) | なんでも |
| (将来)Android の画面 | `android/` など | RN の画面、RN 固有の処理(Service Token のヘッダー、ネイティブの FCM、共有インテント) | なんでも |

**`core/` で使わないもの**(biome の `noRestrictedGlobals` / `noRestrictedImports` で弾く):

- DOM のグローバル: `window` `document` `location` `navigator` `localStorage` `sessionStorage` `caches` `Notification` `history`
- `react-dom`、`wouter`、`firebase`
- JSX(`.tsx` を置かない。プロバイダーは `createElement` で書く)と、Tailwind のクラス名の文字列(色や見た目は画面の層で決める)

web 固有の処理が要るところは、`core` が受け口(関数やオプション)を用意し、web が実装を渡す。例: `createApi({ baseUrl, fetch, headers, onAuthError })`。

`core` の import は `core/<パス>`(例: `core/api/client`、`core/domain/date`)。`package.json` の `exports` で `./*` → `./src/*.ts` にしている。

## フォームの分け方(#31 フェーズ B)

入力画面のロジックは `core/src/forms/<名前>.ts` に置き、画面は「値を表示して、変更を渡す」だけにする。RN では入力の部品が違うので、部品に依存する部分だけが画面の層に残るようにする。

- **フォームの状態の型**を core で決める。自由に打つ欄(タイトル、分数、時刻の文字列など)は打ったままの文字列で持つ。日時は epoch ms か null で持ち、`<input type="datetime-local">` の文字列との変換は web の部品の側でする(RN は日付ピッカーが Date を返すので)
- 純粋関数: `fromEntity(既存の行) → 状態`、`emptyForm() → 状態`、`validateForm(状態) → { 項目: 文言 }`、`toInput(状態) → API に送る形`(検証を通ったときだけ)
- 必要なら `useXxxForm()` のような小さなフックを core に置いてよい(状態・変更・保存中・エラーをまとめる)。保存は core/queries のフックを使う
- 画面の層に残すもの: 部品の選択(input / select / ピッカー)、見た目、ルーティング、シートの開閉、フォーカスなどの DOM の操作

## API の契約

### 共通

- 時刻はすべて epoch ミリ秒(整数)。表示は JST(+09:00 固定)で、端末のタイムゾーンに依存しない
- 認証のコードは書かない。web は Access の cookie、アプリは Access の Service Token のヘッダー(`CF-Access-Client-Id` / `CF-Access-Client-Secret`)。手順は docs/setup.md
- 302/401/403 は「Access のセッション切れ・認証の失敗」。web は再読み込み、アプリは設定の見直しを促す

### エラー

失敗はすべて JSON で `{ "error": "<コード>", "message"?: "<人向けの補足>", "issues"?: ["<項目>: <理由>", ...] }`。

- 入力の検証の失敗は 400 `invalid_input`(`issues` 付き)。ルートごとの意味のあるコード(`overlap`、`working`、`task_closed` など)はそのまま
- 想定外の例外は 500 `internal`(中身は返さない。ログにだけ残す)
- 文言はクライアントが `core/domain/errors.ts` の表でコードから決める。表にないコードは `message`、それもなければコードをそのまま出す
- Access の失敗(302/401/403)は Worker の手前で返るので、この形ではない(本文が JSON とは限らない)

クライアントが受け取りうるコード(実装は `worker/src/routes/` と `worker/src/services/`):

| コード | HTTP | 意味 |
|---|---|---|
| `invalid_input` | 400 | 入力の検証に失敗(`issues` に `"項目: 理由"`)。壊れた JSON・FormData もここ(`message` に理由) |
| `invalid_webhook` | 400 | webhook の作成・更新の入力が不正(`issues` 付き。URL の値は含めない) |
| `invalid_webhook_url` | 400 | webhook の URL が種類(Discord / Slack)に合わない(更新時) |
| `invalid_busy_block` | 400 | 時間割・予定の更新後の内容が不整合(繰り返し/単発の整合など。`issues` 付き) |
| `invalid_course` | 400 | 指定した科目が存在しない |
| `invalid_task` | 400 | 指定したタスクが存在しない(作業記録の作成、受信箱の紐付け) |
| `invalid_range` | 400 | 作業記録の終了が開始より前 |
| `invalid_until` | 400 | ステータスの期限が過去 |
| `invalid_end_at` | 400 | 作業の終了時刻が開始より前、または未来 |
| `invalid_week` | 400 | ふりかえりの週の指定が不正 |
| `not_found` | 404 | 対象がない(存在しないパスも) |
| `overlap` | 409 | 作業記録が他の記録と時間が重なる |
| `working` | 409 | 作業中なのでステータスを変えられない(先に作業を終える) |
| `task_closed` | 409 | 提出済み・取り下げのタスクでは作業を始められない |
| `not_working` | 409 | 作業中ではないので停止できない |
| `not_pending` | 409 | 受信箱の項目がすでに処理済み |
| `no_change` | 409 | 受信箱の項目に適用できる締切の変更がない |
| `too_large` | 413 | 画像が上限(1.5MB)を超えた(`message` あり) |
| `unsupported_media_type` | 415 | 画像が JPEG・PNG・WebP ではない(`message` あり) |
| `internal` | 500 | 想定外の例外 |
| `http_error` | そのまま | Hono が投げたその他の HTTP の失敗(`message` に理由) |

AI の解析の失敗(`/api/parse/*`)はエラーではなく HTTP 200 の `{ candidates: [], error: "<人向けの文>" }` で返る(画面は手入力に切り替える)。この `error` はコードではなく文。

### 互換性

アプリは web と違ってデプロイと同時には更新されない(手で APK を入れ直す)ので、**API の変更は足すだけにする**。

- 項目を消す・意味を変える・必須にする変更をするときは、`GET /api/health` の `apiVersion` を上げる。アプリは起動時に見て、自分の知っている版より新しければ「アプリを更新してください」と出す
- 新しい項目は省略可能にして足す

### 通知(FCM)

- 端末の登録: `POST /api/push/tokens` `{ token, label?, platform?: "web" | "android" }`。web は FID、Android は FCM の登録トークン。`platform` は省略すると、新規は `web`、既存の行は変えない。渡すと上書きする
- 宛先が FID か登録トークンかは token の形で決める(22文字ほどで ":" を含まなければ FID、それ以外は登録トークン)
- 1通のメッセージに `webpush`(web 向け)と `android`(アプリ向け)の両方を入れる。どちらも `data.url`(開く画面のパス)と `data.notificationId` を持つ
  - `android.priority`: 致命は `HIGH`、それ以外は `NORMAL`(proto の enum 名)。`android.ttl`: `"<秒>s"`(webpush の TTL と同じ秒数)
  - `android.notification`: `channel_id`(下記)と `tag`(= `notificationId`。同じ通知は置き換わる)
  - アプリが背景のとき通知は OS が自動で出す。タップすると `data.url` が起動時の extras に入る(アプリはそれを読んでルーティングする)
- Android の通知チャンネル: `critical`(致命。音・バイブあり、優先度 high)と `default`(それ以外)。アプリは起動時にこの2つを作る
- 遷移先(`data.url`)は web のパスと同じ。アプリのルーティング(Expo Router)も同じパスにする。一覧は「遷移先のパス」

### 遷移先のパス

サーバーが `data.url` に入れるパスは次のとおり(`worker/src/notify/policy.ts`・`dispatch.ts`、`services/ingest.ts`・`status.ts`)。クエリやハッシュは付けない。`payload.url` が空のときは `/`。

| パス | 画面 | 使う通知 |
|---|---|---|
| `/` | ホーム(今日の計画) | 朝のダイジェスト、夜の振り返り(`evening`)、「保留中の通知 N件」「通知のまとめ」、テスト送信 |
| `/tasks/:id` | タスクの詳細 | 着手の合図(`start`)、リスク・致命(`risk` / `critical`)、「提出した?」(`submit_check`)、締切が早まった(`due_change`)、提出が取り消された(`inbox`) |
| `/tasks` | タスクの一覧 | 全部は間に合わないときの、落とす候補の通知(`critical`) |
| `/inbox` | 受信箱 | 締切が近い承認待ちの取り込み(`inbox`) |
| `/review` | 先週のふりかえり | 月曜朝の「今週の見通し」(`weekly`) |
| `/status` | ステータス・作業記録 | 「まだやってる?」(`start`) |

`/evening` `/slack` `/timetable` `/settings` `/share` は画面としてあるが、今は通知の遷移先にしていない。アプリのルーティングは、遷移先の6つ(`/`、`/tasks/:id`、`/tasks`、`/inbox`、`/review`、`/status`)を必ず持つこと。新しい遷移先を足すときはここも更新する(足すだけにする。古いアプリが知らないパスは `/` にフォールバックさせる)。

### 画像

`POST /api/parse/image` は multipart の `image` フィールド(JPEG・PNG・WebP、1.5MB まで)。RN では `FormData` に `{ uri, name, type }` を入れて送れる。縮小はクライアントの仕事(web は canvas、アプリは `expo-image-manipulator` など)。
