# myreminder

完全個人用の、大学の課題・タスクリマインダー。目的は「締切駆動の本人が課題をすっぽかさず、徹夜もせず、課題にかける時間は最小に」。

## コンテキスト

**プロジェクトのコンテキストはすべて `ai-docs/` に置き、コミットする。** クラウドのエージェントも使うので、Claude Code のローカルのメモリ機能には保存しない。

- [ai-docs/plan.md](ai-docs/plan.md): 計画書(要件、本人の性格の読み取り、心理ハック、技術スタック、フェーズ、未決事項)。作業を始める前に読む
- [ai-docs/decisions.md](ai-docs/decisions.md): 決定ログ。決めたことは末尾に追記する
- [ai-docs/research/](ai-docs/research/): 調査で確認した事実と出典。調べ直す前にまずここを見る
  - `platform.md`: Cloudflare・FCM・Workers AI・取り込み元
  - `behavior.md`: 心理学・行動経済学
  - `algorithms.md`: スケジューリング・見積もり
  - `gas.md`: Apps Script

本人が何かを決めたとき、エージェントが何かを学んだとき、計画が変わったときは、該当ファイルを更新して同じコミットに含める。

## 作業の進め方

- 本人とのやりとりは日本語。**コミットメッセージ・issue・PR も日本語**
- タスクは GitHub の issue で管理する(https://github.com/tomo-x7/myreminder/issues)
  - plan.md §5 の各行が issue 1つに対応する。ラベル `agent:*` は担当の目安、milestone はフェーズ
  - 着手するときは issue を確認し、終わったらコミットで `closes #N` を付ける
  - 途中で止めるときは、引き継げるよう issue にコメントで状況を残す
- 少なくとも完成するまでは、原則 main に直接 push する
- **リポジトリは public**。秘密情報(Service Token、FCM のサービスアカウント、webhook URL、API トークン)はコミットしない
- 作業はサブエージェントに振り分ける
  - Sonnet: 機能の実装と調査
  - Haiku: 機械的な作業(設定、依存の追加、仕様が決まった小さなスクリプト、ドキュメントの参照)
  - Opus(メイン): 設計、仕様の確定、レビュー、統合
  - 振り分けの目安は plan.md §5
- テストは `worker/src/planner/` などバックエンドの壊れやすい純粋関数だけに書く。それ以外には頼まれない限り書かない
- 認証のコードは書かない。Cloudflare Access の内側なので、すべてのリクエストを同一ユーザーとして扱う

## 構成とコマンド

pnpm workspace(`web/`: Vite+React、`worker/`: Hono on Cloudflare Workers、`core/`: web と将来の RN アプリが共有する API クライアント・フック・ロジック。DOM を使わない。規則は [ai-docs/specs/client.md](ai-docs/specs/client.md))。`shared/` は biome 設定の submodule。

```sh
pnpm web dev        # Vite
pnpm worker dev     # wrangler dev
pnpm check          # biome check --write
pnpm -F core typecheck
pnpm -F web build && pnpm -F worker deploy
```
