# 仕様: 週次のふりかえり(#26)

plan.md §2 の設計原則(フレッシュスタート、目標勾配、ストリークを使わない、損失フレームと責めを使わない)に沿って、先週を事実だけで見せる。実装は [worker/src/services/review-helpers.ts](../../worker/src/services/review-helpers.ts)(純粋関数)と [review.ts](../../worker/src/services/review.ts)(DB)。画面は `/review`(`web/src/pages/ReviewPage.tsx`)。

## 定義

- **週**: 活動日(起床から次の起床まで。`planning-helpers.ts`)の月曜から日曜までの7日。JST。境界は月曜の起床時刻(睡眠時間帯の終わり)で、0時ではない
  - `week` は月曜の `YYYY-MM-DD`。月曜でない・実在しない日付は 400 `invalid_week`。省略すると直近の終わった週(今の活動日を含む週の1つ前)
- **使う記録**: `kind = actual` かつ `review = confirmed` で、終了している作業記録だけ。確認待ち(`needs_review`)は数えず、その週に始まったものの件数を `unconfirmedCount` で返す(画面は「確認待ちの記録が N 件あります」から `/status` へ)
- **徹夜**: 活動日 d の夜(次の起床の直前の睡眠時間帯。設定の睡眠時間帯の長さを、次の起床から遡って置く)に、確定済みの作業が合計 **60 分以上**重なっていること。睡眠時間帯が空(開始 = 終了)なら常に false。睡眠時間帯は今の設定を過去の週にも当てはめる
- **完了した週**: タスクが `done` / `submitted` で、確定済みの作業記録の最後の終了時刻が属する活動日の週。確認待ちを含むタスクと、確定済みの記録がないタスクは見積もりの比率に数えない(学習と同じ条件。`actualForSample`)
- **見積もりの比率**: 実績(確定済みの作業記録の合計。窓の外の記録も含む) / 登録時の見積もり。週の代表値は中央値
- **提出**: `submittedAt` がその週に入るタスク。`submittedAt <= dueAt` なら期限内

## `GET /api/review?week=YYYY-MM-DD`

| フィールド | 中身 |
|---|---|
| `week` / `prevWeek` / `nextWeek` | 月曜の日付。`nextWeek` は今の週より先にならない(今の週なら null) |
| `isCurrentWeek` | 今の活動日を含む週 |
| `days` | 7件。`date`(活動日)、`workedMin`、`allNighter`、`counted`(その夜が明けている) |
| `totalMin` / `prevWeekTotalMin` | 週の合計と、その前の週の合計(中立の比較。増減の色分けや文言はしない) |
| `noAllNighterDays` / `countedDays` | 徹夜のない日の数と、その分母(夜が明けた日。終わった週は 7)。途中の週で、まだ来ていない夜を「徹夜なし」に数えないため |
| `submitted` | 提出したタスク(`dueAt`、`submittedAt`、`onTime`) |
| `estimate` | 完了したタスクごとの見積もりと実績・比率と、比率の中央値 `medianRatio` |
| `estimateTrend` | 表示中の週を最後にした8週の `{ week, medianRatio, count }`。データのない週は `medianRatio = null` |
| `unconfirmedCount` | その週に始まった確認待ちの作業記録の数 |

## 作り

- CPU 10ms の制限のため、読むのは `sessions` と `tasks` の2テーブルを1回ずつ(`db.batch`)。8週前から表示中の週の終わりまでに始まった作業を持つタスクを部分クエリで選び、そのタスクの作業記録を(窓の外のぶんも)すべて読む
- 画面
  - 先頭に今週のフレッシュスタートの1行(`/api/schedule` の山場。月曜は「新しい週のはじまり」)
  - 7日の棒、合計と前の週(中立)、提出したタスク(遅れは事実だけ。赤にしない)、見積もりの傾向(「見積もりの 1.4 倍かかる傾向」と8週のスパークライン)、「徹夜なし 6/7 日」
  - ストリークは作らない
- 月曜朝の `weekly` ダイジェストの `url` は `/review`
