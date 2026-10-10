# セットアップ(簡潔版)

やることの一覧。詳しい手順・つまずいたときは [setup.md](setup.md) の同じ番号を見る。

秘密情報(Service Token、FCM の JSON、API トークン)はコミットしない。公開してよいのは `firebaseConfig`・VAPID 公開鍵・D1 の `database_id`。

## 1. Cloudflare

- [ ] **D1**: `pnpm -F worker exec wrangler d1 create myreminder` → `database_id` を `worker/wrangler.jsonc` に書いてコミット
- [ ] **Access アプリ 1**(デプロイより前に): Self-hosted、`reminder.tomo-x.win` 全体、Allow、Emails = `<あなたのメールアドレス>`、セッション 1 month
- [ ] **Service Token**: 名前 `apps-script`。Client ID / Secret はその場で控える(再表示されない)。期限をカレンダーに入れる
- [ ] **Access アプリ 2**: `reminder.tomo-x.win/api/ingest/*`、Action は **Service Auth**(Allow ではない)、Include = Service Token `apps-script`
- [ ] **API トークン**(Custom): Account の Workers Scripts:Edit / D1:Edit / Account Settings:Read、Zone の Workers Routes:Edit(権限エラーが出たら Zone:Read を足す)。対象は自分のアカウントと `tomo-x.win` だけ

Workers AI とカスタムドメインは `wrangler.jsonc` の設定だけで済む(`reminder.tomo-x.win` に既存の CNAME があれば消しておく)。

## 2. Firebase

- [ ] プロジェクト+Web アプリを作り、`firebaseConfig` の 4 つ(apiKey / projectId / messagingSenderId / appId)を控える
- [ ] Cloud Messaging → Web Push certificates で鍵ペアを作り、公開鍵(VAPID)を控える
- [ ] 上の 5 つを `web/src/push/firebase-config.ts` の `YOUR_...` に入れてコミット
- [ ] Google Cloud で **FCM Registration API** が有効か確認
- [ ] Service accounts → 秘密鍵(JSON)を生成。リポジトリの外に保存

## 3. GitHub Actions でデプロイ

- [ ] repository secret に `CLOUDFLARE_API_TOKEN`(1 のトークン)と `CLOUDFLARE_ACCOUNT_ID` を登録
- [ ] main に push(または Actions から手動実行)→ チェック・D1 のマイグレーション・デプロイまで走る

手元からなら `pnpm web build && pnpm -F worker exec wrangler d1 migrations apply myreminder --remote && pnpm -F worker exec wrangler deploy`。

## 4. Worker の secret と通知の確認

- [ ] `pnpm -F worker exec wrangler secret put FCM_SERVICE_ACCOUNT` に JSON の中身を貼る → JSON を削除
- [ ] Android の Chrome で開く → 設定 → 通知をオン → テスト通知が届けば OK

## 5. 確認

```sh
curl -sI https://reminder.tomo-x.win/api/health | head -n 1      # Access のログインへ(200 でない)
curl -sI https://reminder.tomo-x.win/api/ingest/ping | head -n 1 # 403
curl -s -H "CF-Access-Client-Id: $CF_ID" -H "CF-Access-Client-Secret: $CF_SECRET" \
  https://reminder.tomo-x.win/api/ingest/ping                    # {"ok":true}
```

3 つ目がログイン画面や 302 になるなら、アプリ 1 と 2 のパスの優先順位が想定と違う(setup.md 1-6)。

## 6. Apps Script(Classroom)

- [ ] 大学のアカウントで script.google.com に新しいプロジェクト
- [ ] プロジェクトの設定で `appsscript.json` を表示 → `gas/appsscript.json` の中身で置き換え
- [ ] `pnpm gas build` → `gas/dist/Code.js` の中身を `コード.gs` に貼る
- [ ] スクリプト プロパティ: `INGEST_URL` = `https://reminder.tomo-x.win/api/ingest/classroom`、`CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`
- [ ] `checkConnection` →「接続OK」、`syncClassroom` →「取り込み完了」、`installTrigger` で1時間ごと

更新は `pnpm gas build` して貼り直すだけ(トリガーはそのまま)。302/401/403 は Service Token か Access アプリ 2 の設定。

## デプロイ後に試すこと

- [ ] スライドの写真を1枚読ませる(#25: 読み取りの精度、Workers AI のダッシュボードで neurons)
- [ ] 設定画面で Discord / Slack の webhook を登録して、テスト送信
