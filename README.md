# myreminder

大学の課題のリマインダー。個人用。

締切から逆算して「いつまでに始めないと間に合わないか」を出し、すっぽかしと徹夜を防ぐ。課題にかける時間はなるべく増やさない。

## できること

- **登録**: 手入力のほか、AI で文・告知文・写真から読み取れる。Android の共有メニューからも送れる
- **繰り返し**: 毎週・隔週・毎月。回数・終了日・無期限
- **計画**: 着手デッドラインと週の山場を出す
- **通知**: プッシュ(FCM)。朝・夜のまとめと、リスクに応じた個別の通知
- **ステータスと作業記録**: 「作業中」にした時間がそのまま実績になる
- **余裕リスト**: 急がない課題を、今やる価値の高い順に並べる
- **ふりかえり**: 週ごとの作業時間、徹夜しなかった日数、見積もりの精度
- **取り込み**: Google Classroom の課題を Apps Script で取り込み、受信箱で承認してからタスクにする
- **Discord / Slack**: 提出したこと・1日の作業時間を投稿する。プッシュ通知を全部そのまま流すこともできる

## 仕組み

### 計画

時間割・予定・睡眠を除いた空き時間に、残りの作業を締切から逆算して詰める。

- **見積もりの較正**: 自分の見積もりは楽観的になりがち(計画錯誤)。過去の「実績 ÷ 見積もり」をベイズ推定で学習し、課題の種類と長さごとに補正した値で計画する
- **キャパの学習**: 1日の作業時間に上限は決めず、実績から「普段のペース」を学習する。普段のペースで足りなければ「本気が必要」、本気でも足りなければ「致命」と出す。睡眠時間は計画に入れないので、徹夜前提の計画にはならない
- **着手デッドライン**: 「この時刻までに始めないと間に合わない」を、空き時間と必要時間の数字と一緒に出す。偽の早めの締切は作らない
- **山場**: 締切ごとの余裕を計算し、一番余裕のない締切を週の山場として出す
- **捨てる候補**: どうやっても間に合わないときは、間に合わない数が最小になる外し方(Moore–Hodgson 法)を示す
- **余裕リスト**: 急がない課題を「今の空き時間にやると、計画全体がどれだけ楽になるか」の順に並べる。課題ごとに計画を立て直して比べている

### AI

登録のときだけ使う(Cloudflare Workers AI。文は Qwen3、写真は Gemma 4)。

- 1行の文や告知文から課題を取り出す。時間割を渡すので「来週月曜の授業前まで」が日時になる
- スライドや掲示の写真から読み取る
- 「毎週」「毎月」を読み取って、繰り返しの既定値にする
- 読み取りが怪しいとき(締切が読めない、過去の日付、授業のない曜日の「授業前」など)は、理由を付けて「要確認」にする。出力が崩れたら形を縛ってやり直し、それでもだめなら別のモデルに切り替える

### 通知

- 授業中・作業中・睡眠中は送らず、空き時間の始まりや授業の直後に送る。たまった分は1通にまとめる
- 朝・夜のまとめが基本。個別の通知はリスクの高いものだけで、1日の上限がある
- 計画とは別に、締切の24時間前と3時間前には必ず送る
- 文面は事実だけ(締切・必要な時間・着手の限界)。励ましや煽りは書かない

### 設計の根拠

先延ばしの研究を調べ、根拠の強さを確かめてから仕掛けを選んだ。詳細と出典は [ai-docs/research/behavior.md](ai-docs/research/behavior.md)。

| 使ったもの | 中身 |
|---|---|
| 実装意図(if-then プランニング) | 登録のときに「いつ始める?」を決め、その時刻に合図を1回送る |
| 計画錯誤・参照クラス予測 | 見積もりを自分の実績から補正する |
| 正直な締切 | 着手デッドラインは計算の根拠ごと見せる。偽の早めの締切は作らない |
| 時間の見せ方 | 締切は `10/14(水) 23:59 ・ 3日後 ・ 来週` と、曜日と相対表記を必ず付ける |
| 割り込みの研究 | 通知を切れ目に送り、まとめ、上限を設ける |

使わなかったもの: 外から押しつける中間締切(Ariely & Wertenbroch 2002 は 2026年9月に撤回された)、「未完了だと気になり続ける」という前提(ツァイガルニク効果はメタ分析で否定)、意志力の消耗を前提にした設計(36ラボの事前登録研究で d = 0.06)、ストリーク、損失を煽る文言。

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
