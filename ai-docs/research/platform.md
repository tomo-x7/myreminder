# 調査メモ: プラットフォームと取り込み元

2026-10-11 にサブエージェントが公式ドキュメントなどで確認した事実。**未確認** と書いたものは裏が取れていない。料金や上限は変わるので、実装前に必要なところだけ出典で確認し直すこと。

## Cloudflare 無料プラン

### Workers

https://developers.cloudflare.com/workers/platform/limits/

- リクエストは 100,000/日(UTC 0時にリセット)
- CPU 時間は HTTP リクエスト1回あたり 10ms、Cron 1回あたり 10ms
- サブリクエストは1回あたり、外部へ 50、Cloudflare のサービスへ 1,000
- Cron Trigger は無料プランで1アカウント5本(有料は250本)
- Cron の最小粒度は1分(ドキュメントの例が `* * * * *` で、明記はない)。設定の反映には最大15分かかる
- Queue コンシューマーの無料プランでの CPU 上限は**未確認**。10ms と仮定する

### D1

https://developers.cloudflare.com/d1/platform/pricing/

- 読み取り 500万行/日、書き込み 10万行/日、保存容量 5GB
- 上限を超えるとエラーを返す

### Durable Objects

https://developers.cloudflare.com/durable-objects/platform/pricing/

- 無料プランでも使える(SQLite バックエンドのみ)
- 上限は 10万リクエスト/日、13,000 GB-s/日
- Alarm は1つの DO につき1つ。少なくとも1回は実行される(at-least-once)
- (この計画では使わない。決定ログ #4)

### Queues / Workflows

- Queues は無料プランでも使える: 10,000 操作/日、保持期間 24h 固定、`delaySeconds` は最大 24h
  - https://developers.cloudflare.com/queues/platform/limits/
- Workflows も無料プランで使える: 1ステップあたり CPU 10ms、`step.sleep` は最大365日。実行回数は Workers の 10万/日 と共有
  - https://developers.cloudflare.com/workflows/reference/limits/

### Static Assets と SPA

- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- 静的アセットへのリクエストは無料・無制限。Worker が呼ばれた回数だけがカウントされる
- `not_found_handling: "single-page-application"` の挙動
  - 互換日付が 2025-04-01 以降なら、ナビゲーション(`Sec-Fetch-Mode: navigate`)は Worker を通さずに `index.html` を返す
- `run_worker_first: ["/api/*"]` は配列で指定でき、`!` での除外もできる
  - Wrangler 4.20.0 以上が必要
  - 使うと自動のナビゲーション判定は無効になる
- `/api/*` で存在しないパスは Hono 側で 404 を返す(SPA のフォールバックに任せない)
- 10万/日を超えると、`run_worker_first` 対象のリクエストは 429 になる

### Browser Rendering(無料プラン)

https://developers.cloudflare.com/browser-rendering/platform/limits/

- ブラウザの利用時間は 10分/日、同時に 3ブラウザまで
- SSO 経由のスクレイピングには足りない

### Email Routing(決定ログ #8 で不採用)

- 無料。ドメインの DNS が Cloudflare にある必要がある。Email Worker から `postal-mime` でパースできる
- 無料プランの CPU 10ms で大きなメールをパースすると超える恐れがある

## Cloudflare Access

- `workers_dev: false` では workers.dev しか塞がらない。プレビュー URL も塞ぐには `preview_urls: false` も必要
  - ダッシュボードだけで無効にしても、次の `wrangler deploy` で戻る
  - https://developers.cloudflare.com/workers/configuration/previews/
- セッション期間は既定 24h、最長 1か月
  - https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
- Service Token は `CF-Access-Client-Id` と `CF-Access-Client-Secret` のヘッダーで送る
  - ポリシーのアクションを **Service Auth** にしないと IdP のログインに飛ばされる
  - シークレットは作成時に1回しか表示されない。期限があるので更新が必要
  - https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- ブラウザから別オリジンの Access アプリを呼ぶと、プリフライト(OPTIONS)には cookie が付かないので 403 になる
  - 拡張機能なら `host_permissions` で回避できる
- PWA と Access の相性(公式ドキュメントにはなく、コミュニティの報告)
  - キャッシュ優先の Service Worker は、Access のログインへのリダイレクトを隠してしまう
  - 対策: `/cdn-cgi/*` を Service Worker で扱わない、`/api` が 302/401/403 を返したら再読み込みする
- Static Assets を使う場合、`ctx.access` は Worker に渡されない(JWT を検証したいなら自前で検証する)

## FCM

- HTTP v1 のトークン取得
  - サービスアカウントで RS256 の JWT を作る
    - `iss` = client_email
    - `scope` = `https://www.googleapis.com/auth/firebase.messaging`
    - `aud` = `https://oauth2.googleapis.com/token`
    - `exp` は最大1h
  - `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` でトークンを取得する。有効期限は通常 3600秒
  - https://firebase.google.com/docs/cloud-messaging/auth-server
- 送信: `POST https://fcm.googleapis.com/v1/projects/PROJECT_ID/messages:send`
- ライブラリ
  - `web-auth-library` は 2023年以降更新が止まっている
  - `jose` はメンテナンスされていて Workers で動く。WebCrypto で手書きしても30行ほど
- Web 側
  - `firebase-messaging-sw.js`、VAPID キー、HTTPS が必要
  - 新しい SDK は `register()` / FID 方式で、旧来の `getToken` 系は非推奨。SDK 6.7.0 以上は Google Cloud で FCM Registration API の有効化が必要
  - https://firebase.google.com/docs/cloud-messaging/web/get-started
- メッセージの種類
  - notification メッセージは、バックグラウンドなら自動で表示される
  - data のみのメッセージは、Service Worker の `onBackgroundMessage` で `showNotification()` を呼ぶ必要がある
- `webpush.fcm_options.link` でクリック時の遷移先を指定できる。data のみのメッセージでは使えないので、その場合は `notificationclick` で処理する
- iOS はホーム画面に追加した PWA かつ iOS 16.4 以上でのみ受信できる。本人は Android なので関係ない

## Workers AI

https://developers.cloudflare.com/workers-ai/platform/pricing/

- 無料プランは 10,000 neurons/日(UTC 0時にリセット)。超えると失敗する

モデルごとの比較(コストは 100万トークンあたりの neurons、入力 / 出力):

| モデル | コンテキスト | JSON / 関数呼び出し | コスト(入 / 出) | 1回(入力1,500+出力300トークン)の推定 |
|---|---|---|---|---|
| `@cf/qwen/qwen3-30b-a3b-fp8` | 32k | 関数呼び出しあり、json_schema は**未確認** | 4,625 / 30,475 | ≈16 → 約600回/日 |
| `@cf/openai/gpt-oss-20b` | 128k | 関数呼び出しあり | 18,182 / 27,273 | ≈35 → 約280回/日 |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 128k | **未確認** | 31,876 / 50,488 | ≈63 → 約160回/日 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 24k | JSON mode あり(公式に記載) | 26,668 / 204,805 | ≈101 → 約100回/日 |

- JSON mode
  - 指定は `response_format: { type: "json_schema", json_schema: {...} }`
  - ストリーミングとは併用できない
  - 「JSON Mode couldn't be met」というエラーを返すことがある
  - https://developers.cloudflare.com/workers-ai/features/json-mode/
- 日本語の品質はどのモデルのページにも書かれていない → 実際のデータで試す
- 埋め込み: `@cf/baai/bge-m3` は多言語対応で 1,075 neurons/100万トークン(ほぼ無料)。日本語特化の `@cf/plamo-embedding-1b` もある(コストは**未確認**)
- AI Gateway は無料でキャッシュとログが使える。Workers AI バインディング経由で使えるかは**未確認**

### 画像入力(Vision)に対応するモデル(2026-10-11 に確認、#25)

- 無料枠で使える画像対応モデルの一覧(料金表 https://developers.cloudflare.com/workers-ai/platform/pricing/ 2026-10-09 更新、モデル一覧 https://developers.cloudflare.com/workers-ai/models/)
  - 有料プラン(または AI Gateway の前払いクレジット)が必須のモデルは `kimi-k2.6` / `kimi-k2.7-code` / `glm-5.2` / `glm-5.3` / `glm-5.3-flash` / `deepseek-v4-*`。画像対応でも無料枠では使えない
  - `@cf/google/gemma-3-12b-it`: 料金表には残っているが、モデルのページは「deprecated, removed, or not found」で、モデル一覧にも出ない。**使わない**
- 画像の渡し方(モデルごとの API スキーマ `…/models/<名前>/sync-input.json` で確認)
  - OpenAI 互換の `messages` で、`content` に `[{type:"text",text}, {type:"image_url", image_url:{url, detail?}}]` の配列を渡す。`url` は「data:image/jpeg;base64,… のようなデータ URI」(公式の API リファレンス https://developers.cloudflare.com/api/ の ai.run の messages 項、`llms-full.txt` にも同文)
  - `gemma-4-26b-a4b-it` と `qwen3.8-27b` はこの形がスキーマに明記されている(`type` は text / image_url / video_url / input_audio / file)
  - `llama-3.2-11b-vision-instruct`: スキーマは `prompt` + `image`(バイト配列かバイナリ文字列。「Deprecated, use image as a part of messages now」)。公式チュートリアルは `messages` と別に `image: "data:image/png;base64,…"` を渡している(https://developers.cloudflare.com/workers-ai/tutorials/llama-vision-tutorial/)。**初回に `{"prompt":"agree"}` を1回送ってライセンスに同意する必要がある**(2026-10 のモデルページにも同じ注記がある)
  - `llama-4-scout-17b-16e-instruct`: ページは「Vision あり」だが、スキーマ(sync-input.json)に画像の欄がなく、画像の渡し方は公式ドキュメントでは**未確認**
  - `mistral-small-3.1-24b-instruct`: 説明は「vision understanding」だが、スキーマに画像の欄もモデル一覧の Vision 表示もない。**未確認**
  - `llava-1.5-7b-hf`: Image-to-Text、**Beta**。入力は画像のバイナリ文字列(または `prompt` を含むオブジェクト)。料金表に載っていない(コストは**未確認**)。JSON 出力の仕組みなし
  - `moondream3.1-9B-A2B`: Image-to-Text。`image` は「公開 HTTPS URL か base64 のデータ URI」、`task` は query / caption / point / detect。自由な JSON 出力の仕組みは**未確認**
- JSON mode / 構造化出力
  - `gemma-4-26b-a4b-it`・`qwen3.8-27b`: `response_format: {type:"json_schema", json_schema:{name, schema, strict?}}`(OpenAI 形式。`name` が必須)がスキーマにある。`json_object` も可
  - `llama-4-scout`: `response_format`(`json_object` / `json_schema`)と `guided_json` がある。ただし画像と組み合わせられるかは未確認
  - `llama-3.2-11b-vision`: スキーマに `response_format` がない(**JSON mode なし**)
  - `mistral-small-3.1`: `guided_json` のみ。`response_format` は**未確認**
- 推論(thinking)の切り方: `gemma-4` と `qwen3.8` は `chat_template_kwargs: {enable_thinking: false}`(既定は true)。qwen3.8 は `reasoning_effort`(low / medium / xhigh、既定 xhigh)もある。公式チュートリアルも gemma-4 に `enable_thinking: false` を付けている
- コスト(100万トークンあたりの neurons、入力 / 出力。料金表)

| モデル | コスト(入 / 出) | 1枚(入力 約2,800 + 出力 約400トークン)の推定 |
|---|---|---|
| `@cf/google/gemma-4-26b-a4b-it` | 9,091 / 27,273 | ≈36 → 約270回/日 |
| `@cf/meta/llama-3.2-11b-vision-instruct` | 4,410 / 61,493 | ≈37 |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | 24,545 / 77,273 | ≈100 |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 31,876 / 50,488 | ≈110 |
| `@cf/qwen/qwen3.8-27b` | 40,909 / 290,909 | ≈230(思考を切れたとき)。切れずに2,000トークン出すと ≈700 |
| `@cf/moondream/moondream3.1-9B-A2B` | 27,273 / 90,909 | ≈110 |

- 見積もりの前提(推定であり、実測ではない)
  - 入力 約2,800 = 画像 約1,100 + 既存の解析プロンプト(暦・時間割・科目・ルール)約1,700。出力は JSON 約400
  - 画像が何トークンになるかは、Workers AI の料金表にも各モデルのページにも**書かれていない(未確認)**。Gemma 4 の本家は画像1枚あたりの視覚トークン予算を 70 / 140 / 280 / 560 / 1120 から選ぶとあり(https://ai.google.dev/gemma/docs/capabilities/vision)、最大の 1120 で見積もった。Cloudflare がどの予算を使っているかは未確認
  - 実際の消費は、解析を1回走らせて Workers AI のダッシュボードで確認する
- 日本語(画像内の文字)の読み取り品質
  - Cloudflare のどのページにも書かれていない
  - Gemma 4 26B-A4B: Google は「object detection and OCR に強い」と述べ、精度が要る視覚タスクでは高いトークン予算を勧めている(上のページ。OCR 専用の推奨はなし)。日本語のマルチモーダル評価では Heron-Bench(自由記述)で 3.602 と比較した2モデル(2.806 / 2.631)を上回り、JMMMU(選択式)は 0.438 でほぼ同等(DGX Spark での NVFP4 量子化による1回の検証。Cloudflare 上の挙動とは限らない。https://dev.classmethod.jp/en/articles/dgx-spark-nemotron3-nano-omni-japanese-multimodal-bench/)。OCR 単独の日本語ベンチは**見つからなかった**
  - 講義スライドの写真での実測は**未確認**(Cloudflare のアカウントがない環境では試せていない)。実機で試すこと

## 取り込み元

### Google Classroom

- 学生でも API を使える。スコープは `classroom.courses.readonly`、`classroom.coursework.me.readonly`、`classroom.student-submissions.me.readonly`
  - https://developers.google.com/workspace/classroom/guides/auth
- 主な障害は Workspace 管理者のアプリアクセス制御。ブロックされると `admin_policy_enforced` になる
- OAuth 同意画面が「テスト」状態だと、リフレッシュトークンは7日で失効する(確認済み)
  - 「本番」にすれば未確認アプリの警告が出るだけで、1人で使う分には使える
  - その場合のトークンの寿命は**未確認**
- Apps Script を学生自身のアカウントで動かす場合
  - Classroom の拡張サービスと `UrlFetchApp` が使える
  - クォータ: トリガーの実行時間は合計 6h/日、UrlFetch は 10万回/日、1回の実行は最大6分
  - 管理者が組織単位で Apps Script を無効にしている可能性がある(既定は有効)
  - https://developers.google.com/apps-script/guides/services/quotas
- Classroom の通知メールは、新しい課題や「24時間以内に締切」で届く。本文に含まれる項目は**未確認**
- Classroom の課題はクラスの Google カレンダーにも載る(個別に割り当てられた課題を除く)

### WebClass(データパシフィック)

- ログインの方式
  - 学内 ID で直接ログインする場合は `/webclass/login.php` に POST する
  - SSO(CAS / Shibboleth / SAML、Microsoft 365 + MFA など)は大学ごとの設定による
- iCal、RSS、公開 API は見つからなかった
- 通知メールはメッセージ・掲示板・提出完了などのみ。**新しい課題や締切は通知されない**
- 既存の OSS(どれも API はなく、`/webclass/course.php/<id>/` の HTML を解析している)
  - https://github.com/piyoryyta/WebClassDeadlineManager (Python。`.cl-contentsList_content`、`.cm-contentsList_contentName a`、締切は `%Y/%m/%d %H:%M`)
  - https://github.com/mitsuiJao/webc-assignments (Puppeteer。Microsoft SSO + TOTP、cookie を使い回す)
  - https://github.com/emak3/WebClass-Deadline-Viewer (Chrome 拡張。2026-07。`利用可能期間` と `締め切り:` を解析)
- SSO+MFA の大学でいちばん現実的なのは、ログイン中のブラウザで動く拡張

### Gmail(Workspace)

- 管理者設定の「自動転送」は既定で有効
- この計画では Gmail からの取り込み自体をやめた(決定ログ #14)
