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

## API の契約

### 共通

- 時刻はすべて epoch ミリ秒(整数)。表示は JST(+09:00 固定)で、端末のタイムゾーンに依存しない
- 認証のコードは書かない。web は Access の cookie、アプリは Access の Service Token のヘッダー(`CF-Access-Client-Id` / `CF-Access-Client-Secret`)。手順は docs/setup.md
- 302/401/403 は「Access のセッション切れ・認証の失敗」。web は再読み込み、アプリは設定の見直しを促す

### エラー

失敗はすべて JSON で `{ "error": "<コード>", "message"?: "<人向けの補足>", "issues"?: ["<項目>: <理由>", ...] }`。

- 入力の検証の失敗は 400 `invalid_input`(`issues` 付き)。ルートごとの意味のあるコード(`overlap`、`working`、`task_closed` など)はそのまま
- 想定外の例外は 500 `internal`
- 文言はクライアントが `core/domain/errors.ts` の表でコードから決める。表にないコードは `message`、それもなければコードをそのまま出す

### 互換性

アプリは web と違ってデプロイと同時には更新されない(手で APK を入れ直す)ので、**API の変更は足すだけにする**。

- 項目を消す・意味を変える・必須にする変更をするときは、`GET /api/health` の `apiVersion` を上げる。アプリは起動時に見て、自分の知っている版より新しければ「アプリを更新してください」と出す
- 新しい項目は省略可能にして足す

### 通知(FCM)

- 端末の登録: `POST /api/push/tokens` `{ token, label?, platform: "web" | "android" }`。web は FID、Android は FCM の登録トークン
- 1通のメッセージに `webpush`(web 向け)と `android`(アプリ向け)の両方を入れる。どちらも `data.url`(開く画面のパス)と `data.notificationId` を持つ
- Android の通知チャンネル: `critical`(致命。音・バイブあり、優先度 high)と `default`(それ以外)。アプリは起動時にこの2つを作る
- 遷移先(`data.url`)は web のパスと同じ。アプリのルーティング(Expo Router)も同じパスにする。一覧は「遷移先のパス」

### 遷移先のパス

(#30 で、通知・ダイジェストが実際に使っているパスを書く)

### 画像

`POST /api/parse/image` は multipart の `image` フィールド(JPEG・PNG・WebP、1.5MB まで)。RN では `FormData` に `{ uri, name, type }` を入れて送れる。縮小はクライアントの仕事(web は canvas、アプリは `expo-image-manipulator` など)。
