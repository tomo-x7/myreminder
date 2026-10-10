# セットアップ手順(人間が一度だけやること)

このリポジトリは **public** です。この手順で作る Service Token、FCM のサービスアカウント鍵、API トークン、webhook URL などの秘密情報は、**絶対にコミットしないでください**。置き場所は次のとおりです。

| 秘密情報 | 置き場所 |
|---|---|
| Access の Service Token(Client ID / Secret) | Apps Script の Script Properties |
| FCM のサービスアカウント JSON | Worker の secret(`FCM_SERVICE_ACCOUNT`) |
| Cloudflare API トークン、Account ID | GitHub の repository secret |
| webhook URL(Discord / Slack) | Worker の secret か D1(アプリ側で登録) |

公開してよいもの: Firebase の Web 設定(`firebaseConfig`)、VAPID 公開鍵、D1 の `database_id`、Cloudflare の Account ID(ただし GitHub secret に入れる)。

作業は `docs/setup.md` を上から順に進めてください。各節の末尾に公式ドキュメントへのリンクを付けています。

---

## 前提

- Cloudflare アカウントがあり、ドメイン `tomo-x.win` の DNS が Cloudflare にあること(ゾーンが Cloudflare の Active 状態)
- Node.js と pnpm が入っていること。リポジトリのルートで `pnpm install` 済みであること
- Google アカウント(Firebase 用)と GitHub アカウント(このリポジトリの管理者)
- `wrangler` は `pnpm -F worker exec wrangler ...` で実行する(グローバルに入れる必要はない)
- 0-1 の作業で `worker/wrangler.jsonc` の `name` が `myreminder`、D1 の `database_name` が `myreminder` になっていること。`workers_dev` / `preview_urls` は `false`

最初に Cloudflare にログインします。

```sh
pnpm -F worker exec wrangler login
```

Wrangler のログインには Cloudflare の公式ドキュメントに従ってください。

- Wrangler コマンド: https://developers.cloudflare.com/workers/wrangler/commands/

---

## 1. Cloudflare

### 1-1. D1 データベースを作る

```sh
pnpm -F worker exec wrangler d1 create myreminder
```

出力に表示される `database_id`(UUID)を、`worker/wrangler.jsonc` の `d1_databases` に書きます。`database_id` は秘密ではないのでコミットしてかまいません。

```jsonc
"d1_databases": [
	{
		"binding": "DB",
		"database_name": "myreminder",
		"database_id": "ここに出力された UUID"
	}
],
```

マイグレーションは `worker/migrations` にあり、CI でも同じコマンドが実行されます。手元で適用する場合は次のとおりです。

```sh
pnpm -F worker exec wrangler d1 migrations apply myreminder --remote
```

- `--remote` を付けないとローカルの D1 に適用されます
- 参照: https://developers.cloudflare.com/d1/reference/migrations/ / https://developers.cloudflare.com/workers/wrangler/commands/d1/

### 1-2. Workers AI(設定は不要)

`wrangler.jsonc` に次のバインディングがあれば十分です。ダッシュボードでの作成は不要です。

```jsonc
"ai": { "binding": "AI" }
```

- 無料枠は 1日 10,000 neurons(UTC 0時にリセット)。超えると AI 呼び出しが失敗するので、手動登録の解析は失敗時にフォールバックさせる
- 参照: https://developers.cloudflare.com/workers-ai/platform/pricing/

### 1-3. Zero Trust の初回設定(未設定の場合のみ)

Zero Trust のダッシュボード(https://one.dash.cloudflare.com/)を開き、チーム名を決めます。ログイン方法は **One-time PIN**(メールにワンタイムコードが届く方式)が追加設定なしで使えます。Google などの IdP を使う場合は、Settings > Authentication で追加してください。

### 1-4. Access アプリ 1: サイト全体(本人だけ入れる)

1. Zero Trust > **Access controls** > **Applications** > **Add an application** > **Self-hosted**
2. Application name: `myreminder`
3. Session Duration: **1 month**
4. Application domain: ドメイン `reminder.tomo-x.win`、パスは空欄(ドメイン全体を保護)
5. Policy を作る
   - Policy name: `owner`
   - Action: **Allow**
   - Include: Selector **Emails**、値 `<あなたのメールアドレス>`
6. 保存する

- セッション期間の上限は 1か月です
- 参照: https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/ / https://developers.cloudflare.com/cloudflare-one/access-controls/policies/

### 1-5. Service Token を作る(Apps Script 用)

1. Zero Trust > **Access controls** > **Service credentials** > **Service Tokens** > **Create Service Token**
2. Name: `apps-script`(用途がわかる名前)
3. Service Token Duration: 期限を選ぶ(期限が切れると取り込みが止まるので、カレンダーに更新日を入れておく)
4. **Generate token** を押す

表示される **Client ID** と **Client Secret** は、この画面を閉じると **二度と表示されません**。すぐに Apps Script の Script Properties に保存してください(後述の 5 を参照)。紛失したら Token を作り直します。

- 期限が切れると、Apps Script 側の 401/403 として現れます。「Refresh」で1年延長できます
- ヘッダー名: `CF-Access-Client-Id` と `CF-Access-Client-Secret`
- 参照: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/

### 1-6. Access アプリ 2: 取り込み API(Service Auth)

1. 同じく **Add an application** > **Self-hosted**
2. Application name: `myreminder-ingest`
3. Application domain: `reminder.tomo-x.win`、Path: `/api/ingest/*`
4. Policy を作る
   - Policy name: `apps-script`
   - Action: **Service Auth**(Allow ではない。Allow にすると IdP のログイン画面に飛ばされる)
   - Include: Selector **Service Token**、値 `apps-script`(1-5 で作った Token)
5. 保存する

**パスの優先順位について**: 公式ドキュメントには「同じ上位パスのルールが複数あるとき、より具体的なルールが優先される」と書かれています。`/api/ingest/*` のアプリはアプリ 1 より具体的なので、こちらが使われる想定です。ただし、ドキュメントには「別々の Access アプリどうしが重なった場合」の挙動が明示されていません。**次の「確認方法」で必ず実際に確かめてください。** 確認がうまくいかない場合は、アプリ 1 の Policy に `/api/ingest/*` を Bypass 扱いにする構成などを検討します。

- 参照: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/ / https://developers.cloudflare.com/cloudflare-one/access-controls/policies/

### 1-7. Worker の初回デプロイとカスタムドメイン

ビルドしてデプロイします。

```sh
pnpm web build
pnpm -F worker exec wrangler deploy
```

`wrangler.jsonc` に次の設定があれば、デプロイ時にカスタムドメインと DNS レコードが自動で作られます。

```jsonc
"routes": [
	{ "pattern": "reminder.tomo-x.win", "custom_domain": true }
],
"assets": {
	"directory": "../web/dist",
	"not_found_handling": "single-page-application",
	"run_worker_first": ["/api/*"]
},
```

- `reminder.tomo-x.win` に既存の CNAME レコードがあると、カスタムドメインは作れません。先に DNS から削除してください
- Access アプリ 1 と 2 は、このデプロイより前に作っておくのが安全です(Access が効く前に公開されている時間を作らないため)
- 静的アセットの配信自体は無料で、Worker の呼び出し回数にはカウントされません
- 参照: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ / https://developers.cloudflare.com/workers/static-assets/

### 1-8. CI 用の API トークン(GitHub Actions 用)

GitHub Actions が `wrangler deploy` と `wrangler d1 migrations apply --remote` を実行するためのトークンです。最小権限のカスタムトークンを作ります。

1. https://dash.cloudflare.com/profile/api-tokens を開き **Create Token** > **Create Custom Token**(テンプレートは使わない)
2. Token name: `github-actions-myreminder`
3. Permissions(必要最小限の候補)
   - **Account** > **Workers Scripts** > **Edit**
   - **Account** > **D1** > **Edit**
   - **Account** > **Account Settings** > **Read**
   - **Zone** > **Workers Routes** > **Edit**
   - **Zone** > **Zone** > **Read**(カスタムドメインの解決に必要か未確認。デプロイが権限エラーで失敗したら追加する)
4. Account Resources: 自分のアカウントのみ
5. Zone Resources: `tomo-x.win` のみ
6. **Continue to summary** > **Create Token**
7. 表示された値を一度だけコピーする(再表示されない)

注意: 「Edit Cloudflare Workers」テンプレートは出発点として使えますが、D1 の権限は含まれないと見られます。テンプレートを使う場合も、上の D1 Edit を追加してください。Workers AI 関連の権限は、デプロイが AI バインディングで失敗した場合のみ追加します。

- 参照: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ / https://developers.cloudflare.com/fundamentals/api/reference/permissions/

Account ID は、ダッシュボードのどのゾーンでも右側のサイドバーに表示されます。

---

## 2. Firebase(FCM で Web Push を送る)

### 2-1. プロジェクトと Web アプリを作る

1. https://console.firebase.google.com/ で **プロジェクトを作成**(名前は例: `myreminder`)。Google アナリティクスは不要
2. プロジェクトの概要で **</>(ウェブ)** のアイコンを押してアプリを登録する(ニックネーム: `myreminder-web`)。Firebase Hosting は設定しない
3. 表示される `firebaseConfig`(`apiKey`、`projectId`、`messagingSenderId`、`appId` など)を控える

`firebaseConfig` と VAPID 公開鍵は公開してよい値です。2-3 の VAPID 公開鍵と合わせて、**`web/src/push/firebase-config.ts`** の `YOUR_` で始まるプレースホルダを実際の値に置き換えてコミットします(`.env` は gitignore されているので使いません)。

| 埋める場所 | Firebase コンソールの値 |
|---|---|
| `firebaseConfig.apiKey` | `apiKey` |
| `firebaseConfig.projectId` | `projectId` |
| `firebaseConfig.messagingSenderId` | `messagingSenderId` |
| `firebaseConfig.appId` | `appId` |
| `vapidKey`(2-3 で取得) | Web Push certificates の公開鍵 |

`YOUR_` のままだと、通知を有効にしようとしたときに「Firebase の設定が未入力です」と表示されて止まります。Service Worker(`web/public/firebase-messaging-sw.js`)には、この設定が URL のクエリで渡されるので、Service Worker 側を編集する必要はありません。

- 参照: https://firebase.google.com/docs/cloud-messaging/js/client

### 2-2. FCM Registration API を有効にする

新しい Firebase SDK(6.7.0 以上)を使うには、Google Cloud で **FCM Registration API** が有効である必要があります。

1. Google Cloud Console(https://console.cloud.google.com/)で、Firebase と同じプロジェクトを選ぶ
2. **APIs & Services** > **Library** で `FCM Registration API` を検索して **有効にする**

新しく作ったプロジェクトでは既定で有効になっていることが多いですが、確認してください。

- 参照: https://firebase.google.com/docs/cloud-messaging/js/client

### 2-3. VAPID 公開鍵を取得する

1. Firebase コンソールの **Project settings**(歯車)> **Cloud Messaging** タブ
2. **Web configuration** の **Web Push certificates** で **Generate key pair**
3. 表示される **公開鍵**(Key pair)を控える。これが VAPID 公開鍵です

表示された公開鍵を `web/src/push/firebase-config.ts` の `vapidKey` に貼ります(2-1 の表を参照)。秘密鍵の側は Worker では使いません。

- 参照: https://firebase.google.com/docs/cloud-messaging/js/client

### 2-4. サービスアカウントの鍵(JSON)を作る

1. **Project settings** > **Service accounts** タブ
2. **Generate new private key** を押して確認する
3. JSON がダウンロードされる。ファイル名は `<プロジェクト名>-firebase-adminsdk-xxxxx.json` のようになる

この JSON は**極めて強い権限**を持つ秘密情報です。リポジトリの中に置かないでください(ダウンロード先は `~/Downloads` などリポジトリの外にする)。Worker の secret に登録したら、ファイルは削除します。

- 参照: https://firebase.google.com/docs/admin/setup / https://firebase.google.com/docs/cloud-messaging/auth-server

### 2-5. Android の Chrome で動作確認する

1. 2-1〜2-4 と 3(secret の登録)を終えて、デプロイする(`pnpm -F web build && pnpm -F worker exec wrangler deploy`)
2. Android の Chrome で `https://reminder.tomo-x.win` を開き、Access でログインする
3. `PushToggle`(設定画面に置く予定。置くまでは一時的に `App.tsx` に `<PushToggle />` を入れて確認する)で「通知をオンにする」を押し、通知を許可する
4. 「テスト通知」を押す。通知が届き、タップするとアプリが開けば OK
5. 届かないとき: テスト通知の応答の `code` を見る(`UNAUTHENTICATED`/`PERMISSION_DENIED` は Worker の secret かサービスアカウントの権限、`UNREGISTERED` は端末の登録が古い。FCM Registration API が無効だと登録の段階で失敗する)。`pnpm -F worker exec wrangler tail` でも確認できる

ホーム画面への追加(PWA のインストール)はなくても Android の Chrome では通知が届きます。

---

## 3. Worker の secret

Worker の secret は `wrangler secret put` で登録します。コマンドは `worker/` で実行します。

```sh
pnpm -F worker exec wrangler secret put FCM_SERVICE_ACCOUNT
```

プロンプトが出たら、2-4 でダウンロードした JSON の**中身全体**を貼り付けて Enter します。

ファイルから流し込む方法もあります(wrangler のバージョンで動作が変わるので、うまくいかなければ貼り付け方式にしてください)。

```sh
pnpm -F worker exec wrangler secret put FCM_SERVICE_ACCOUNT < ~/Downloads/ダウンロードしたファイル.json
```

登録後は、ローカルの JSON を削除します。

```sh
rm ~/Downloads/ダウンロードしたファイル.json
```

- 登録されたことを確認します(値は表示されず、名前だけ出ます)

  ```sh
  pnpm -F worker exec wrangler secret list
  ```

- secret はデプロイ後も残ります。`wrangler deploy` で消えることはありません
- Discord / Slack の webhook URL は、Worker の secret ではなく、アプリの設定画面から D1 に入れる方針です(§3.11)。ここでは登録しません
- 参照: https://developers.cloudflare.com/workers/configuration/secrets/ / https://developers.cloudflare.com/workers/wrangler/commands/

---

## 4. GitHub Actions の secret

GitHub のリポジトリの **Settings** > **Secrets and variables** > **Actions** > **New repository secret** で、次の 2 つを登録します。

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 1-8 で作ったカスタムトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare の Account ID(ダッシュボードのサイドバー) |

- 登録後は値を再表示できません。紛失したらトークンを作り直して登録し直します
- ワークフロー(`.github/workflows/deploy.yml`)は `main` への push(ドキュメントと `gas/` だけの変更を除く)と、Actions 画面からの手動実行(`workflow_dispatch`)で動きます。biome・型チェック・テスト・`web` のビルドを通したあと、D1 のマイグレーションと `wrangler deploy` を行います
- secret が未登録のうちは、チェック(biome・型チェック・テスト・ビルド)だけ行い、マイグレーションとデプロイは飛ばします
- 初回のデプロイの前に、`worker/wrangler.jsonc` の `database_id` を実際の値に置き換えてコミットしておいてください(プレースホルダのままだと失敗します)
- Worker の secret(3 の `FCM_SERVICE_ACCOUNT` など)はワークフローからは登録しません。手元で `wrangler secret put` した値がデプロイ後も残ります
- 参照: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets

---

## 5. Apps Script(Classroom の取り込み)

Classroom の課題を1時間ごとに Worker へ送る Apps Script のセットアップです。ソースは `gas/` にあり、ビルドした `gas/dist/Code.js` をエディタに貼り付けます。`gas/dist/` はコミットされません。

- このリポジトリは **public** です。Client Secret は Script Properties にだけ入れ、コード・コミット・チャットには書かないでください
- Apps Script のプロジェクトを開ける人は Script Properties を読めます。プロジェクトは自分だけが編集できる状態にしておきます

### 5-1. プロジェクトを作る

大学の Google アカウント(Classroom を使っているアカウント)で、https://script.google.com を開きます。

1. **新しいプロジェクト** を押す
2. 名前を `myreminder-classroom` などに変える

- 参照: https://developers.google.com/apps-script/guides/projects

### 5-2. マニフェスト(appsscript.json)をエディタで表示する

1. 左の歯車(**プロジェクトの設定**)を開く
2. **「appsscript.json」 マニフェスト ファイルをエディタで表示する** にチェックを入れる
3. エディタに戻ると `appsscript.json` が出るので、中身をリポジトリの `gas/appsscript.json` の内容で置き換える

タイムゾーン、V8 ランタイム、Classroom の拡張サービス、必要な権限(スコープ)がこのファイルで決まります。

- 参照: https://developers.google.com/apps-script/concepts/manifests

### 5-3. Code.js を貼り付ける

手元(リポジトリのルート)でビルドします。

```sh
pnpm gas build
```

`gas/dist/Code.js` ができるので、中身をすべて開き、エディタの `コード.gs`(最初からあるファイル。名前は何でもかまいません)に貼り付けます。最初からある `myFunction` などのコードは消してください。貼り付けたら保存します(Ctrl+S)。

### 5-4. Script Properties を設定する

歯車(**プロジェクトの設定**)の **スクリプト プロパティ** で、次の 3 つを追加します。

| プロパティ | 値 |
|---|---|
| `INGEST_URL` | `https://reminder.tomo-x.win/api/ingest/classroom` |
| `CF_ACCESS_CLIENT_ID` | 1-5 で表示された Client ID |
| `CF_ACCESS_CLIENT_SECRET` | 1-5 で表示された Client Secret |

- Client Secret は、1-5 の画面を閉じると見られなくなります。紛失したら Service Token を作り直し、ここの値を入れ直します
- 参照: https://developers.google.com/apps-script/guides/properties

### 5-5. 接続確認、同期、トリガーの順に実行する

エディタの上の関数の選択肢で関数を選び、**実行** を押します。

1. **`checkConnection`** を実行する。初回は権限の承認が出るので許可する。実行ログに「接続OK」が出れば、Service Token と URL は正しい
2. **`syncClassroom`** を実行する。Classroom の読み取りの権限を許可する。実行ログに「取り込み完了: 受信 N / 新規 N / …」が出れば成功
3. **`installTrigger`** を実行する。左の時計のアイコン(**トリガー**)に `syncClassroom` が1時間ごとに登録されていれば完了

- 承認画面に「このアプリは確認されていません」と出る場合は、自分で作ったプロジェクトなので内容を確かめて許可します
- トリガーは、作成したアカウントの権限で動きます。そのアカウントが大学のドメインから外れると止まります

### 5-6. 更新するとき

コードを変えたら、リポジトリのルートで次を実行します。

```sh
pnpm gas build
```

`gas/dist/Code.js` の中身をすべてコピーして、エディタの `コード.gs` に貼り直して保存します。マニフェストを変えた場合は `appsscript.json` も貼り直します。トリガーはそのままで、`installTrigger` の再実行は不要です。

### 5-7. うまくいかないとき

実行ログ(**実行数** の画面、または関数を実行したときのログ)で原因を見ます。

| ログ | 原因と対処 |
|---|---|
| HTTP 302 | Access のログイン画面に転送されている。Service Token が認証されていません。1-6 のアプリの Policy が **Service Auth** か、パスが `/api/ingest/*` かを確認する |
| HTTP 401 / 403 | Service Token が無効か、期限切れです。1-5 の Token を Refresh(延長)するか作り直し、Script Properties の `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` を更新する |
| Script Properties が足りません | 5-4 の 3 つのプロパティのどれかが未設定か、名前が違う |
| Classroom の拡張サービスが有効ではありません | マニフェストの `enabledAdvancedServices` が入っていない。5-2 をやり直す |

- Service Token の期限は、1-5 で決めた期間です。切れる日をカレンダーに入れておくと止まりにくくなります

---

## 確認方法

### Cloudflare

ブラウザで `https://reminder.tomo-x.win` を開きます。

- Access のログイン画面が出る(One-time PIN か IdP)
- `<あなたのメールアドレス>` でログインすると、画面が表示される

Access が効いているかを、ターミナルの `curl` で確かめます。

```sh
# 1. ログインしていないリクエストは、Access のログインへ行く(200 にならないこと)
curl -sI https://reminder.tomo-x.win/api/health | head -n 1

# 2. 取り込み用パスは、Service Token なしでは拒否される(403 になること)
curl -sI https://reminder.tomo-x.win/api/ingest/ping | head -n 1
```

Service Token を使うと、Worker まで届くことを確かめます。`CF_ID` と `CF_SECRET` は環境変数で渡し、コマンドラインや履歴に値を直接書かないでください。

```sh
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "CF-Access-Client-Id: $CF_ID" \
  -H "CF-Access-Client-Secret: $CF_SECRET" \
  https://reminder.tomo-x.win/api/ingest/ping
```

- 403 や 302 ではなく、Worker からの応答(404 など。ルートがまだない場合)が返れば、Service Auth のアプリが効いています
- 応答が 302 やログイン画面なら、パスの優先順位が想定と違います。1-6 の Policy の Action(Service Auth)を確認してください

### D1

```sh
pnpm -F worker exec wrangler d1 execute myreminder --remote --command "select 1"
```

`results` が返れば、D1 に接続できています。

### Worker の secret

```sh
pnpm -F worker exec wrangler secret list
```

`FCM_SERVICE_ACCOUNT` が表示されれば OK です。

### GitHub Actions

GitHub の **Settings** > **Secrets and variables** > **Actions** に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` の 2 つがあることを確認します。ワークフローが動いたら **Actions** タブで成功しているかを見ます。

### 最後に確認すること

- `git status` で、JSON、Service Token、トークンの値などがステージされていないこと
- `git grep -n "BEGIN PRIVATE KEY\|CF-Access-Client-Secret:"` で秘密情報が混ざっていないこと(何も出なければ OK)
