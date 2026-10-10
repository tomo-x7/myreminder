# myreminder 計画書

> 完全個人用の、大学の課題・タスクリマインダー。
> 作成: 2026-10-11 / 更新: 2026-10-11(メール・取り込み方針を変更)/ 状態: たたき台(未決事項は末尾)
> 決定の経緯は [decisions.md](decisions.md)、調査で確認した事実と出典は [research.md](research.md) を参照。

## 0. ゴール

**締切駆動で動く僕が、課題をすっぽかさず、徹夜もしない。課題にかける時間はなるべく少なく。**

これを壊す失敗パターン(ヒアリング結果):

| 失敗 | 対策の柱 |
|---|---|
| 締切の勘違い・見落とし | 登録時に締切を確認させる / 日付は曜日+相対表記 / 取り込み元がある場合はそちらを正とし、締切の変更を検知 |
| 知ってたけど忘れる | 登録を速くして必ず入れる + 朝のダイジェスト + 「着手時刻」の通知 |
| 着手が遅れてギリギリ→徹夜 | 「正直な着手デッドライン」 / 見積もり補正の学習 / 睡眠時間には作業を入れない |
| 事務系の細かいタスク(アンケート・奨学金など)を忘れる | 「すきま時間タスク」としてまとめて出す |
| (おまけ)やったのに出してない | 「完了」と「提出済み」を分ける / 提出確認 |

## 1. 性格の読み取り(仮説。違ったら直して)

| 読み取り | 根拠 | 設計への反映 |
|---|---|---|
| 締切が唯一のエンジン。遠い締切は存在しないのと同じ | 本人申告 | 遠い締切を「残り日数」ではなく「残りの**空き時間**」で見せて近く感じさせる |
| 嘘の締切は見抜いて無視する(合理的・エンジニア気質) | 技術選定の書き方、テスト=負債という判断 | 偽の早め締切は作らない。着手デッドラインは**計算根拠を見せる**本物の制約にする |
| 早く終わらせたいわけではなく、最小の労力で落とさないのが目的 | 「課題に割く時間を最小に」 | 「早くやれ」とは言わない。ジャストインタイム+安全マージン(ALAP) |
| 見積もりが楽観的 | 着手遅れ→徹夜 | 実績から見積もりの補正率を学習(平均ではなく80パーセンタイルを使う) |
| 通知は無視しないが集中を削がれる | 本人申告 | 通知予算(1日の上限)+Discord 風ステータスで抑制。保留中の通知は1件にまとめる |
| 設定作業や仕組みづくりの手間は嫌うが、件数が少ないので登録の手間は惜しまない | 本人申告(「全部手動で登録できる程度、その手間は惜しまない」) | **手動登録が主役**。自動取り込みは費用対効果が高いものから段階的に足す |

環境: メインのスマホは Android。PC は Linux(CachyOS / fish)。pnpm、biome、Tailwind を使う。

## 2. 心理ハック(機能に落とすもの)

1. **正直な着手デッドライン** — `締切 − 必要時間(見積もり×補正率) − 睡眠/授業/バイト` を逆算した「この時刻までに始めないと徹夜確定」の時刻を、根拠つきで出す。偽締切ではないので無視できない。
2. **実装意図(if-then プランニング)** — 登録したら「いつやる?」をワンタップで決めさせる(AI 提案の空き枠 / 今日の夜 / 明日)。決めた時刻に「21:00 になった」と通知する。
3. **最初の一歩** — 通知に「まず5分だけ: テンプレを開いて見出しだけ書く」のような極小の行動を添える(AI がタスク作成時に1回だけ生成)。始めれば続く(ツァイガルニク効果)。
4. **時間を具体化する** — 「あと3日」ではなく「残り空き 4.5h / 必要 3h」と見せる。日数は多く感じるが、空き時間は少なく感じる。
5. **後回しのコストを見せる(損失回避)** — スヌーズ時に「明日に回すと木曜は 2h 必要、徹夜リスク: 中」と再計画の結果を見せる。スヌーズ自体は禁止しない。
6. **ホームは「次の1件」だけ** — 全リストではなく、今やるべき1件を大きく出す。何をやるか選ぶ疲れを減らす。
7. **通知は少なく、効くものだけ** — 余裕のある課題は個別通知せず朝のダイジェストに入れるだけ。リスクが上がるほど通知が増える。
8. **作業中タイマー=見積もり学習** — 「作業中」ステータスがそのまま実績計測になり、補正率が育つ。記録のためだけの入力はさせない。
9. **すきま時間タスク(2分ルール)** — アンケートや書類提出など10分以内で終わるものは「今やれば終わる」としてまとめ、授業の合間などの短い空き枠や朝のダイジェストで出す。締切までの逆算はしない。

## 3. 機能一覧

### 3.1 タスク

- 種別: `assignment`(課題・見積もりあり)/ `chore`(事務系・すきま時間タスク)
- 状態: `inbox`(自動取り込みの未確認) → `todo` → `doing` → `done`(作業完了) → `submitted`(提出済み) / `dismissed`
- 項目: タイトル、科目、締切、取り込み元+元リンク、見積もり(分)、見積もりの出どころ(AI/手入力)、最初の一歩、メモ
- 締切表示: `10/14(火) 23:59 ・ 3日後の夜`。`24:00` 表記は `翌日 0:00` に正規化して表示し、日付の取り違えを防ぐ
- 締切が変わったら通知+履歴に残す
- `done` のまま `submitted` にならない場合は「提出した?」を確認する

### 3.2 手動登録(主役)

件数が少なく手間も惜しまないとのことなので、ここの速さと正確さに一番力を入れる。

- **自然文1行** → AI が解析 → 確認カード → 保存
  - 例: `情報倫理 来週月曜の授業前までにレポート2000字`
  - 時間割を AI に渡すので「授業前」は授業の開始時刻に解決される
  - 確認カードでは締切を `10/20(月) 10:40 ・ 9日後の朝` のように曜日+相対で必ず見せる(勘違い対策の要)
- **告知文の貼り付け** → AI が複数のタスクを抽出 → まとめて確認。ポータルのお知らせやメールの本文をそのまま貼る用途
- **Android の共有メニューから PWA に送る**(Web Share Target)。ポータルやメールアプリのテキスト・URL を共有するだけで、上の貼り付けと同じ流れに入る
- (後回し)スライドの写真 → 視覚モデルで課題を抽出

### 3.3 時間割・予定・睡眠

- 時間割: 曜日×時限で登録。学期の期間つき
- 単発の予定(バイトなど)、睡眠時間帯(既定 1:00–8:00 など)
- 以上を「埋まっている時間」として計画で使う

### 3.4 スケジューラ(純粋関数。テストするのはここだけ)

- 入力: 現在時刻、タスク(締切・残り見積もり・分割できるか・最小の作業単位)、埋まっている時間、設定(補正率・バッファ・1日の作業上限)
- 処理:
  1. 14日先までの空き枠を作る(睡眠時間帯は空き枠にしない → **徹夜を構造的に禁止**)
  2. 必要時間 = 残り見積もり × 補正率(実績比の80パーセンタイル。初期値 1.5)
  3. 締切が早い順(EDF)に、締切側から**できるだけ遅く**詰めて(ALAP)、各タスクの着手デッドラインを出す
  4. おすすめ着手時刻 = 着手デッドライン − マージン
  5. 余裕(slack)= 着手デッドライン − 現在時刻 → リスクレベルを決める
  6. 収まらない場合は 🔥 にして、手を抜く候補や延長交渉を提案する
- `chore` は逆算の対象外。短い空き枠に割り当てる候補として扱う
- 再計画はタスクや予定の変更時と、cron の毎時処理で行う

### 3.5 ステータス(Discord 風・手動+自動ルール)

| ステータス | 通知の扱い | 自動で切り替わる条件 |
|---|---|---|
| 🟢 通常 | 通常どおり | — |
| 🛠 作業中: {タスク} | 致命以外は保留。タイマーで計測し、終了時に「どれくらい進んだ?」で残りを更新 | — |
| 🔴 取り込み中 | 致命以外は保留 | 時間割の授業中、バイト中 |
| 🌙 おやすみ | すべて保留して朝のダイジェストにまとめる | 睡眠時間帯 |

- 手動で設定するときは期限つき(30分 / 1時間 / 今日中 / 解除するまで)
- 保留が明けたら、保留中の通知は「保留中 N件」の1通にまとめる(連続で鳴らさない)

### 3.6 通知ポリシー

| リスク | 条件(目安) | 通知 |
|---|---|---|
| 余裕 | slack が必要時間の2倍超 | 個別通知なし。朝のダイジェストに載るだけ |
| 注意 | それ以下 | 本人が決めた時刻(なければおすすめ着手時刻)に1回+最初の一歩 |
| 危険 | 着手デッドラインが24h以内 | 着手デッドラインに向けて段階的に(数時間おき) |
| 致命 | 締切3h以内で未提出 | 作業中・取り込み中でも通す(おやすみは設定次第) |

- 定時: 朝のダイジェスト(起床時刻)、夜の確認(「今日の予定終わった? [済] [明日に回す]」)
- 致命以外の個別通知は1日3件まで。超えた分はまとめる
- 致命は FCM の `Urgency: high` にして、Android の省電力による遅延を避ける

### 3.7 自動取り込み(段階的に足すおまけ)

**方針: 手動登録だけで成立させる。自動取り込みは「手動より楽になる」ものだけを、作る手間が小さい順に足す。** 作るのが面倒になったら、そこで止めて手動に戻ればよい。

すべての取り込み元は共通の `POST /api/ingest` に正規化して送る。どれか1つが壊れても他は止まらない作りにする。

| 優先度 | 取り込み元 | 方式 | 得られるもの | 主なリスク |
|---|---|---|---|---|
| 1 | Google Classroom | **大学アカウントで動く Apps Script**(時間トリガー)が Classroom API を叩いて POST する | 課題と締切、提出状態(TURNED_IN → `submitted` を自動で付けられる) | 管理者が Apps Script や API を禁止している可能性 |
| 1 | 大学 Gmail | **同じ Apps Script** が `GmailApp.search` で対象のメール(ポータルの通知など)を拾い、本文を POST → Worker 側で AI 抽出 → `inbox` | アンケート・奨学金などの事務系タスク(ポータルが通知メールを出す場合) | ポータルが通知メールを出さないなら取れない → 共有メニューで手動 |
| 2 | WebClass | ブラウザ拡張(MV3): ログイン中のセッションを流用し、`chrome.alarms` で定期的に科目ページを巡回・解析して POST する | 課題と締切 | 作る手間が一番大きい。ブラウザを開いていないと取れない。HTML 構造の変更 |
| — | ポータル | スクレイピングはしない。共有メニューか貼り付けで手動登録 | — | — |
| — | 口頭・スライド | 手動登録(§3.2) | — | — |

- Apps Script は1つのプロジェクト(`gas/`)で Classroom と Gmail の両方を扱う。大学アカウントの権限で動くので、Gmail の転送設定や Cloudflare Email Routing は使わない
- WebClass の通知メールは新しい課題や締切をカバーしない(メッセージ・掲示板・提出完了のみ)ので、自動化するなら拡張しかない。手動で困らなければ作らない
- WebClass の拡張を作る場合は既存 OSS の実装を参考にする(`.cl-contentsList_content` まわりのセレクタ、`利用可能期間` の文字列)
  - https://github.com/piyoryyta/WebClassDeadlineManager
  - https://github.com/emak3/WebClass-Deadline-Viewer
- 重複の排除: まず `(取り込み元, 外部ID)` で upsert する。手動登録と自動取り込みの重複は「科目+正規化したタイトル+締切±1日」で候補を出し、ワンタップでまとめる
- 構造化されている取り込み元(Classroom / WebClass)は `todo` に直接入れる。AI で抽出したもの(Gmail)は `inbox` に入れて確認する

### 3.8 AI(Workers AI 無料枠: 1日 10,000 neurons)

| 用途 | タイミング | 1日あたりの回数(目安) |
|---|---|---|
| 自然文1行の解析 | 登録時 | 数回 |
| 貼り付け・共有されたテキストからの複数抽出 | 登録時 | 数回 |
| Apps Script が送ってきたメール本文からの抽出 | 取り込み時 | 〜10 |
| 所要時間の初期推定(似たタスクの実績を few-shot で渡す) | タスク作成時 | 数回 |
| 最初の一歩の生成 | タスク作成時 | 数回 |
| 朝のダイジェスト文面 | 1日1回 | 1 |

- 主力: `@cf/qwen/qwen3-30b-a3b-fp8`(1回 ≈16 neurons と推定 → 1日 ≈600回分。安い)
- 予備: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`(JSON mode が公式ドキュメントに載っている。1回 ≈100 neurons)
- 出力は必ず valibot で検証する。失敗したら1回だけ再試行し、だめなら予備モデルに切り替える
- JSON mode は「条件を満たせない」エラーを返すことがあるので、エラー処理を入れる
- 日本語の品質はどのモデルもドキュメントに記載がない → 実際の告知文で試して選ぶ
- 通知の送信処理(cron)では AI を呼ばない。文面はタスク作成時や朝にまとめて生成して保存しておく
- AI Gateway(無料)はログやキャッシュ用に任意で使う

## 4. 技術スタック

### 4.1 構成

```
                ┌──────── Cloudflare Access (Zero Trust) ─────────┐
Android PWA ──▶ │ 独自ドメイン                                      │
(FCM SW)        │  ├─ 静的アセット (web/dist, SPA フォールバック)      │
                │  └─ /api/* ──▶ Worker (Hono)                      │
Apps Script ──▶ │       /api/ingest/* は Service Token (Service Auth) │
WebClass 拡張 ─▶ │                                                   │
                └────────────────────────────────────────────────┘
                       Worker: fetch / scheduled (cron 毎分)
                         ├─ D1 (drizzle)
                         ├─ Workers AI
                         └─ FCM HTTP v1 ──▶ 端末
```

- **Worker は1つ**: Workers Static Assets で SPA を配信し、`/api/*` だけ Worker を通す(`run_worker_first: ["/api/*"]`)。同じオリジンなので Access の cookie がそのまま効き、CORS も不要
- 静的アセットへのリクエストは無料・無制限で、Worker の 10万リクエスト/日 にはカウントされない
- Apps Script と拡張は Access の Service Token(`CF-Access-Client-Id` / `CF-Access-Client-Secret` ヘッダー)で `/api/ingest/*` に POST する。そのパスだけ別の Access アプリにして、ポリシーを Service Auth にする

### 4.2 バックエンド (`worker/`)

| 項目 | 採用 | メモ |
|---|---|---|
| ランタイム | Cloudflare Workers(無料プラン) | CPU 10ms/回、外部へのサブリクエスト 50/回 |
| フレームワーク | Hono | ルートはメソッドチェーンで書き、`AppType` を export する |
| バリデーション | valibot + `@hono/valibot-validator` | (依頼文の「validot」は valibot と解釈した) |
| DB | D1 + drizzle-orm / drizzle-kit | マイグレーションは `drizzle-kit generate` → `wrangler d1 migrations apply` |
| 定期実行 | Cron Trigger `* * * * *` を1本 | 中で分岐して、毎分の通知送信・毎時の再計画・定時のダイジェストを行う。無料枠は5本 |
| AI | Workers AI バインディング | §3.8 |
| プッシュ | FCM HTTP v1 を直接叩く | サービスアカウントの JWT(RS256)を WebCrypto か `jose` で署名して OAuth トークンを取得。トークン(1h)はモジュールスコープと D1 にキャッシュ |
| 認証 | なし(Access に任せる) | すべてのリクエストを同一ユーザーとして扱う |

エクスポートの形:

```ts
export default {
	fetch: app.fetch,
	scheduled: (event, env, ctx) => { /* 毎分の処理 */ },
} satisfies ExportedHandler<CloudflareBindings>;
```

`wrangler.jsonc` の要点:

```jsonc
{
	"name": "myreminder",
	"main": "src/index.ts",
	"workers_dev": false, // Access を迂回させない
	"preview_urls": false, // 同上(workers_dev だけでは塞がらない)
	"routes": [{ "pattern": "<独自ドメイン>", "custom_domain": true }],
	"assets": {
		"directory": "../web/dist",
		"not_found_handling": "single-page-application",
		"run_worker_first": ["/api/*"],
	},
	"triggers": { "crons": ["* * * * *"] },
	"d1_databases": [{ "binding": "DB", "database_name": "myreminder", "database_id": "..." }],
	"ai": { "binding": "AI" },
}
```

### 4.3 フロントエンド (`web/`)

| 項目 | 採用 | メモ |
|---|---|---|
| ビルド | Vite + React 19 | 既存の雛形をそのまま使う |
| API クライアント | `hc<AppType>` + TanStack Query | `worker` を workspace 依存にして `import type` する。**web の tsconfig にも `strict: true` が必要**(ないと hc の型推論が崩れる) |
| ルーティング | TanStack Router(または画面が少なければ不要) | 画面: ホーム(次の1件)/ 一覧 / 受信箱 / 時間割 / 設定 |
| スタイル | Tailwind CSS v4 | shared の biome 設定に tailwind 用の override があるため |
| PWA | Web App Manifest + 自前の Service Worker | FCM の `firebase-messaging-sw.js` と統合する。Share Target もここで |
| プッシュ | firebase JS SDK(messaging のみ) | 新しい SDK はトークン API が変わっている(`register()` 方式)ので、実装時に確認する |

**Access と Service Worker の注意点**:

- Service Worker はナビゲーションと `/api` をキャッシュしない(ネットワーク優先)
- `/cdn-cgi/*` は Service Worker で扱わない
- `/api` が 302/401/403 を返したら、ページを再読み込みして Access のログインに飛ばす
- Access のセッション期間は長め(例: 1か月)にする

### 4.4 共通

- 時刻は D1 に epoch ミリ秒(integer)で保存する。日付の境界は JST(+09:00 固定、夏時間なし)で計算する
- 開発: `pnpm web dev`(Vite)と `pnpm worker dev`(wrangler)を並行で起動し、Vite の proxy で `/api` を 8787 に流す
- デプロイ: `pnpm -F web build && pnpm -F worker deploy`
- lint・フォーマット: biome(既存の shared 設定)
- テスト: vitest で `worker/src/planner/` の純粋関数だけ。必要になったら取り込みの正規化と重複排除も足す。それ以外は書かない

### 4.5 ディレクトリ

```
myreminder/
├─ ai-docs/             エージェント向けのコンテキスト(この計画書、決定ログ、調査メモ)
├─ web/                 Vite+React SPA / PWA / FCM の Service Worker
├─ worker/
│  ├─ src/
│  │  ├─ index.ts       fetch / scheduled
│  │  ├─ routes/        tasks, ingest, status, schedule, push, settings
│  │  ├─ db/schema.ts   drizzle
│  │  ├─ planner/       純粋関数(唯一テストする場所)
│  │  ├─ notify/        policy(誰にいつ何を送るか), fcm(送信とトークンキャッシュ)
│  │  ├─ ai/            parse(手動登録), extract(取り込みテキスト), estimate, prompts
│  │  └─ ingest/        normalize, dedupe
│  └─ migrations/
├─ gas/                 Classroom+Gmail 取り込み用 Apps Script(clasp で管理)
├─ extension/           WebClass 取り込み用拡張(MV3、作る場合のみ)
└─ shared/              既存の submodule(biome 設定)
```

### 4.6 データモデル(案)

| テーブル | 主な列 |
|---|---|
| `courses` | id, name, aliases(取り込み元ごとの表記揺れ), color |
| `tasks` | id, course_id, kind(assignment/chore), title, due_at, source(manual/classroom/gmail/webclass), external_id, url, estimate_min, estimate_source, status, first_step, note, submitted_at, created_at, updated_at |
| `task_due_history` | task_id, old_due_at, new_due_at, changed_at |
| `sessions` | id, task_id, kind(planned/actual), start_at, end_at, progress |
| `busy_blocks` | id, kind(class/job/event), weekday?, start, end, date_from?, date_to?, label |
| `user_status` | mode, task_id?, until(1行のみ) |
| `notifications` | id, task_id?, kind(digest/start/risk/critical/due_change/submit_check/evening), priority, scheduled_at, status(pending/sent/deferred/merged/skipped), payload |
| `push_tokens` | token, label, created_at, last_seen_at |
| `ingest_raw` | id, source, received_at, raw_text, parsed_json, status, error(AI 抽出のデバッグ用。手動の貼り付けもここに残す) |
| `settings` | key, value(睡眠時間帯、補正率、通知予算、FCM トークンキャッシュなど) |

通知の流れ: 再計画のたびに、未来の `notifications` を作り直す(`pending` のものだけ置き換える)。毎分の cron は `scheduled_at <= now AND status = pending` を取り出し、送信時点のステータスを見て、送信・保留・まとめのどれにするかを決める。

### 4.7 無料枠の見積もり

| リソース | 上限 | 想定使用量 |
|---|---|---|
| Workers リクエスト | 100,000/日 | cron 1,440 + API 数百 ≈ 2,000 |
| Cron Trigger | 5本/アカウント | 1本 |
| D1 | 読み取り 500万行/日、書き込み 10万行/日 | 誤差の範囲 |
| Workers AI | 10,000 neurons/日 | 〜1,000 |
| Access / FCM / AI Gateway | 無料 | — |

ボトルネックになりうるのは **CPU 10ms** だけで、怪しいのは FCM トークン取得時の RS256 署名くらい(トークンをキャッシュすれば1時間に1回)。メールのパースは Apps Script 側でやるので Worker には載らない。

## 5. フェーズ分けとサブエージェントへの振り分け

担当の凡例: **Opus** = 設計・仕様の確定・レビュー・統合 / **Sonnet** = 機能の実装・調査 / **Haiku** = 機械的な作業(設定、依存の追加、仕様が決まった小さなスクリプト、ドキュメントの参照)

### Phase 0: 基盤(順番に進める)

| # | 作業 | 担当 |
|---|---|---|
| 0-1 | 依存の追加、wrangler.jsonc の整備、web の tsconfig を strict に、Tailwind の導入、Vite の proxy 設定 | Haiku |
| 0-2 | drizzle のスキーマ(§4.6)とマイグレーション、Hono のルート骨格(チェーン)、`AppType` の export、web 側の hc+TanStack Query、`/api/health` を端から端まで通す | Sonnet |
| 0-3 | Cloudflare / Firebase の手動セットアップ手順書(Access アプリ、D1 作成、FCM プロジェクト、VAPID、サービスアカウント) | Haiku |
| 0-4 | レビューと動作確認 | Opus |

### Phase 1: MVP(手動登録だけで「見落とさない」が成立する状態)

| # | 作業 | 担当 | 並行 |
|---|---|---|---|
| 1-1 | タスクの CRUD API + valibot | Sonnet | ○ |
| 1-2 | web: ホーム(次の1件)/ 一覧 / 時間割・睡眠の編集 | Sonnet | ○(1-1 の型が決まってから) |
| 1-3 | FCM: web の登録と SW、サーバー側の送信とトークンキャッシュ、毎分の cron 送信 | Sonnet | ○ |
| 1-4 | AI による手動登録: 自然文1行の解析、貼り付けテキストからの複数抽出、確認カード | Sonnet | ○ |
| 1-5 | Web Share Target(共有メニュー → 1-4 の流れ) | Sonnet | 1-3・1-4 の後 |
| 1-6 | 締切ベースの単純な通知(前日・当日・3h前)+朝のダイジェスト | Sonnet | 1-3 の後 |

### Phase 2: スケジューラと心理ハック

| # | 作業 | 担当 |
|---|---|---|
| 2-1 | スケジューラの仕様確定(入出力の型、境界条件、テストケースの一覧) | Opus |
| 2-2 | スケジューラの実装+vitest | Sonnet |
| 2-3 | 通知ポリシーのエンジン(リスクレベル、予算、ステータスによる保留とまとめ、すきま時間タスク) | Sonnet |
| 2-4 | web: ステータス切り替え、作業中タイマー、後回しコストつきスヌーズ、夜の確認、見積もり補正率の学習 | Sonnet |
| 2-5 | 実際に使いながら通知の頻度や文言を調整 | Opus + 本人 |

### Phase 3: 自動取り込み(費用対効果を見ながら、どこで止めてもよい)

| # | 作業 | 担当 |
|---|---|---|
| 3-1 | `/api/ingest` + 正規化 + 重複排除 + 受信箱 UI、Service Token 用の Access ポリシー | Sonnet |
| 3-2 | Apps Script(`gas/`): Classroom の課題と提出状態、Gmail の対象メール | Haiku(仕様が決まれば小さい)→ Opus がレビュー |
| 3-3 | (任意)WebClass 拡張(`extension/`)。**本人の大学の WebClass の HTML サンプルが必要** | Sonnet |

### Phase 4: おまけ

- スライドの写真 → 視覚モデル
- 週次のふりかえり(見積もりの精度、徹夜ゼロ日数)
- Google Calendar の予定を「埋まっている時間」として取り込む(Apps Script から送れる)

## 6. 未決事項(本人に確認したいこと)

1. **Classroom / Gmail**: 大学アカウントで script.google.com を開いて Apps Script を作れるか(Phase 3 の前に確認)。
2. **ポータル**: アンケートや奨学金のお知らせは Gmail に通知メールが来るか。来るなら送信元のアドレスか件名のパターン。
3. **WebClass のログイン方式**: 学内 ID で直接ログインするのか、SSO(Microsoft など)+MFA なのか(拡張を作る場合のみ必要)。
4. **時間割**: 手入力でよいか。大学のポータルから取り込みたいか。
5. **起床・就寝の時刻**、朝のダイジェストを送る時刻。
6. **ゲーミフィケーション**(「徹夜ゼロ連続日数」など)は効くか、うざいか。
7. **独自ドメイン**: アプリを置くドメイン(Cloudflare で管理しているもの。サブドメインでよい)。
