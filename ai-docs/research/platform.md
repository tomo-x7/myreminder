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
