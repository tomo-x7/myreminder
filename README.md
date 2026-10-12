# myreminder

大学の課題のリマインダー。個人用。

締切から逆算して「いつまでに始めないと間に合わないか」を出し、すっぽかしと徹夜を防ぐ。課題にかける時間はなるべく増やさない。

## できること

- **登録**: 手入力が既定。AI で1行の文・告知文の貼り付け・スライドの写真から読み取ることもできる。Android の共有メニューからも送れる
- **繰り返し**: 毎週・隔週・毎月。回数・終了日・無期限
- **計画**: 時間割・予定・睡眠を除いた空き時間に課題を詰め、タスクごとの着手デッドラインと、週の山場(余裕が一番少ない締切)を出す。見積もりは実績から学習する
- **通知**: プッシュ(FCM)。朝・夜のまとめと、リスクに応じた個別の通知。授業中・作業中・睡眠中は保留してまとめる
- **ステータスと作業記録**: 「作業中」にした時間がそのまま実績になる
- **余裕リスト**: 急がないタスクを、今やると全体の余裕が増える順に並べる
- **ふりかえり**: 週ごとの作業時間、徹夜しなかった日数、見積もりの精度
- **取り込み**: Google Classroom の課題を Apps Script で取り込み、受信箱で承認してからタスクにする
- **Discord / Slack**: 提出したこと・1日の作業時間を投稿する。プッシュ通知を全部そのまま流すこともできる

## 構成

```
Android の PWA ─┐
Apps Script ───┼─ Cloudflare Access ─ Worker(Hono)─┬─ D1
               │                     ├ 静的アセット  ├─ Workers AI
               │                     └ /api/*       ├─ FCM
               │                                     └─ Discord / Slack
```

| ディレクトリ | 中身 |
|---|---|
| `worker/` | API・計画・通知(Cloudflare Workers + Hono + D1/drizzle + valibot)。cron は毎分 |
| `web/` | 画面(Vite + React 19 + Tailwind v4 + wouter)、PWA、FCM の Service Worker |
| `core/` | web と将来の RN アプリが共有する層(API クライアント、TanStack Query のフック、入力の変換・検証)。DOM を使わない |
| `gas/` | Classroom を取り込む Apps Script(TypeScript + esbuild。ビルドしてエディタに貼る) |
| `shared/` | biome の設定(submodule) |
| `docs/` | セットアップの手順 |
| `ai-docs/` | 計画書・決定ログ・仕様・調査メモ |

認証のコードはない。全体を Cloudflare Access の内側に置き、すべてのリクエストを同じ本人として扱う。

## 開発

pnpm 11(`package.json` の `devEngines`)と Node.js 22 以降。

```sh
git clone --recurse-submodules https://github.com/tomo-x7/myreminder
cd myreminder
pnpm install

# ローカルの D1 を作る
pnpm -F worker exec wrangler d1 migrations apply myreminder-db --local

# Worker は web/dist を配信するので、先に一度ビルドしておく
pnpm -F web build

pnpm worker dev   # http://localhost:8787
pnpm web dev      # http://localhost:5173(/api は 8787 へ)
```

Workers AI はローカルで動かないので、`wrangler dev` は Cloudflare へのログインが要る。AI の解析を使わないなら `pnpm -F worker exec wrangler dev --local` でよい。

```sh
pnpm check               # biome check --write
pnpm -F worker test      # vitest(計画・通知・取り込みなどの純粋関数)
pnpm -F worker typecheck
pnpm -F core typecheck
pnpm -F web build        # 型チェックとビルド
```

## デプロイ

`main` に push すると GitHub Actions が、チェック → web のビルド → D1 の migration → `wrangler deploy` を行う。初回の準備(Cloudflare・Access・Firebase・GitHub の secret)は [docs/setup-quick.md](docs/setup-quick.md)、詳しい手順は [docs/setup.md](docs/setup.md)。

秘密情報(Service Token、FCM のサービスアカウント、webhook の URL)はリポジトリに置かない。Worker の secret か D1 に入れる。

## ドキュメント

- [ai-docs/plan.md](ai-docs/plan.md): 計画書(要件、設計の根拠、フェーズ)
- [ai-docs/decisions.md](ai-docs/decisions.md): 決定ログ
- [ai-docs/specs/](ai-docs/specs/): 計画のアルゴリズム、取り込み、ふりかえり、繰り返し、クライアントの層と API の契約、UI と文言の規則
