# 仕様: 取り込みと受信箱(#21・#22)

plan.md §3.9 の実装仕様。契約(型)の正は [worker/src/schemas/ingest.ts](../../worker/src/schemas/ingest.ts)。

## 1. 取り込み API

### `POST /api/ingest/:source`

- `source`: `classroom` | `webclass`
- 本文: `{ items: IngestItem[] }`(最大500件)。取り込み元が見えている課題の**スナップショット全体**を送る。送る側は状態を持たない
- 応答: `IngestResult`(`received` / `created` / `autoIgnored` / `updated` / `unchanged`)
- 保護: Cloudflare Access の Service Token(`/api/ingest/*` のアプリ。docs/setup.md 1-5〜1-6)。Worker 側に認証のコードは書かない

### `GET /api/ingest/ping`

`{ ok: true }` を返すだけ。Service Token の設定を確かめるのに使う(docs/setup.md の確認手順)。

### サーバーでの差分(`(source, externalId)` で突き合わせる)

既存の行は、その source の行を1回の select でまとめて読み、メモリで比べる。書き込みは変わった行だけ batch で行う。

| 既存の行 | 動き |
|---|---|
| なし | 新しく作る。`firstSeenAt = lastSeenAt = now`。下の「初めて見たときの自動無視」に当たれば `ignored`、それ以外は `pending`(受信箱に入る) |
| `pending` | 項目を上書きする。`remoteState` が `TURNED_IN` / `RETURNED` になったら `ignored`(`payload.autoIgnored = "submitted"`)にして受信箱から消す |
| `ignored` | 項目を上書きするだけ。**二度と受信箱に出さない** |
| `linked`(`taskId` あり) | 下の「紐付け済みの変化」 |
| `linked`(タスクが削除されて `taskId` が null) | `ignored` と同じ扱い(本人が消したので) |

- 項目 = `title` / `courseName` / `dueAt` / `url` / `remoteState`。`description` / `kind` は `payload` に入れる
- `lastSeenAt` は、項目が変わったとき、または前回から24時間以上たったときだけ更新する(毎時の同期で全行を書き換えない。D1 の書き込み枠のため)。`lastSeenAt` だけの更新は `id in (...)` の1文にまとめる
- スナップショットに**ない**行は何もしない(削除も無視もしない)

**初めて見たときの自動無視**(初回の同期で過去の課題が受信箱にあふれないように):

- `remoteState` が `TURNED_IN` または `RETURNED`
- `dueAt` が `now - 24h` より前

自動無視した行は `status = ignored`、`payload.autoIgnored = "submitted" | "past_due"`。

**承認待ちの個別通知**: 新しく `pending` になった行で、`dueAt` が48時間以内のものは、`inbox` の通知をすぐ(`scheduledAt = now`)作る。文面は「受信箱: <タイトル>(締切 <日時>)」、URL は `/inbox`。それ以外の承認待ちは朝のダイジェストに件数だけ載る(§3)。

### 紐付け済みの変化

**取り込み元の値が前回から変わったときだけ**動く(比べるのは `ingest_items` に保存した前回の値。本人がタスク側を手で直していても、取り込み元が変わらなければ何もしない)。

| 変化 | 動き |
|---|---|
| `dueAt` が変わり、新しい値がタスクの締切より**早い** | すぐタスクの締切を変える(`task_due_history` に `cause: "ingest"`)。`due_change` の通知をすぐ作る(「締切が早まりました: <タイトル> <旧> → <新>」)。安全側に倒す |
| `dueAt` が変わり、新しい値がタスクの締切より遅い | `pendingChange.dueAt = { from: タスクの締切, to: 新しい値 }` |
| `dueAt` が変わったが、タスクの締切と同じ | 何もしない |
| `title` が変わった | `pendingChange.title = { from: タスクのタイトル, to: 新しい値 }` |
| `dueAt` が null になった | 何もしない |
| `remoteState` が `TURNED_IN` になった(前回は違った) | タスクが `submitted` でなければ `submitted` にする(`submittedAt = now`)。webhook の提出済みの報告も送る(`notifySubmitted`) |
| `remoteState` が `RECLAIMED_BY_STUDENT` になった | タスクが `submitted` なら `todo` に戻す(`submittedAt = null`)。`inbox` の通知「提出が取り消されています: <タイトル>」 |

`pendingChange` がある行は受信箱に「変更の提案」として出る。タスクを変えたら、再計画(`triggerReplan` 相当)を呼ぶ。

## 2. 受信箱 API

| メソッド | パス | 中身 |
|---|---|---|
| GET | `/api/inbox` | `{ pending: Item[], changes: Item[] }`。`pending` は承認待ち(締切の早い順、締切なしは最後)、各 Item に重複の候補 `candidates`(最大3件)。`changes` は `pendingChange` のある紐付け済み(タスクのタイトル・締切つき) |
| GET | `/api/inbox/count` | `{ pending: number, changes: number }`(ホームのバナー用) |
| POST | `/api/inbox/:id/accept` | 本文は `taskCreateSchema` と同じ形。タスクを作って紐付ける(`status = linked`)。`remoteState` が `TURNED_IN` / `RETURNED` ならタスクを `submitted` で作る |
| POST | `/api/inbox/:id/link` | `{ taskId }`。既存のタスクに紐付ける。タスクの中身は変えない |
| POST | `/api/inbox/:id/ignore` | `status = ignored` |
| POST | `/api/inbox/:id/change/accept` | `pendingChange` をタスクに反映して(締切は `task_due_history` に `cause: "ingest"`)、`pendingChange = null` |
| POST | `/api/inbox/:id/change/dismiss` | `pendingChange = null` だけ |

- `pending` 以外の行に accept / link / ignore したら 409
- タスクを作る・変えるものは、再計画(`triggerReplan`)を呼ぶ

### 重複の候補(純粋関数。壊れやすいのでテストを書く)

承認待ちのアイテムごとに、未完了・完了どちらも含むタスク(`dismissed` を除く)から探す。

- タイトルの正規化: NFKC → 小文字 → 空白・括弧・記号(`()()[]【】「」『』・:::-—_/`など)を除く
- 科目が同じ: アイテムの `courseName` を正規化したものと、タスクの科目名を正規化したものが等しい
- 候補にする条件(どれか):
  1. 正規化したタイトルが等しい
  2. 科目が同じで、締切の差が ±1日以内
  3. 科目が同じで、正規化したタイトルの片方がもう片方を含む(短いほうが4文字以上)
- 並び: 1 → 3 → 2 の順、同じ条件の中では締切の差が小さい順。最大3件
- 候補があれば、受信箱の既定のアクションを「紐付け」にする

## 3. 朝のダイジェスト

`generateNotifications` の入力に `inboxPending: number`(`pending` の件数 + `changes` の件数)を足し、0 でなければ朝のダイジェストに「受信箱: 確認待ち N件」の行を足す。ダイジェストの URL は今のまま。

## 4. 受信箱の画面(`/inbox`)

- 下タブには足さない(普段は空なので)。ホームに「受信箱: 確認待ち N件 →」のバナー(0件なら出さない)、一覧の上にも同じリンク
- 承認待ちのカード:
  - タイトル・科目・締切(曜日+相対。`formatDueParts`)・取り込み元・リンク(「Classroom で開く」)・本文の先頭(折りたたみ)
  - アクション: [追加] [紐付け] [無視]。候補があれば [紐付け] を既定(目立たせる)にして、候補を並べる
  - [追加] は、クイック追加の `CandidateCard` で中身(見積もり・種類・最初の一歩・いつ始める?)を確かめてから保存する。下書きはアイテムから作る(科目名は登録済みの科目に名前で合わせる)
- 変更の提案のカード: 「締切: 旧 → 新」「タイトル: 旧 → 新」と [反映] [そのまま]
- 自動無視・無視した行は出さない

## 5. Apps Script(#22)

- `gas/` は pnpm workspace のパッケージ。TypeScript+esbuild(IIFE+footer でトップレベル関数を宣言)→ `gas/dist/Code.js` を手動でコピペする(research/gas.md)
- 契約の型は `import type { IngestSnapshotInput } from "../../worker/src/schemas/ingest"` で使う(実行時には何も入らない)
- トップレベル関数:
  - `syncClassroom()`: ACTIVE なコースごとに PUBLISHED な courseWork と、自分の提出(`studentSubmissions.list(courseId, "-", { userId: "me" })`)を集めて POST する
  - `installTrigger()`: `syncClassroom` の1時間ごとのトリガーを作る(既存の同じトリガーは消してから)
  - `checkConnection()`: `/api/ingest/ping` を叩いて結果をログに出す
- 送る範囲: `dueAt` が null、または `dueAt >= 今 - 7日` の課題だけ(件数を抑える)。500件を超えたら締切の近い順に500件
- 締切: `dueDate`+`dueTime` は UTC。`Date.UTC(y, m - 1, d, h ?? 0, min ?? 0)`。`dueTime` がなければ JST 23:59(`Date.UTC(y, m - 1, d, 14, 59)`)
- `externalId` = `${courseId}:${courseWorkId}`、`courseName` = コースの `name`、`url` = `alternateLink`、`remoteState` = 自分の提出の `state`、`kind` = `workType`、`description` = 先頭2000文字
- Script Properties: `INGEST_URL`(`https://reminder.tomo-x.win/api/ingest/classroom`)、`CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`。ヘッダー `CF-Access-Client-Id` / `CF-Access-Client-Secret` で送る
- 失敗の見せ方: `muteHttpExceptions: true` で応答コードを見て、200 以外は本文の先頭200文字とともに `console.error`。302/401/403 なら「Service Token を確認」とログに出す。秘密情報はログに出さない
