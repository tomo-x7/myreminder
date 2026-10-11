# core

web と将来の Android(RN)アプリが共有する、プラットフォームに依存しない層。規則は [ai-docs/specs/client.md](../../ai-docs/specs/client.md)。

| ディレクトリ | 中身 |
|---|---|
| `api/` | `createApi()`(Hono RPC のクライアント)、`ApiProvider` / `useApi()`、`ApiError` / `unwrap`、API の型 |
| `queries/` | TanStack Query のキーとフック。変更後の取り直しもここで決める |
| `domain/` | 純粋関数: 日付の言い方、リスク・進捗の言い方、エラーの文言、下書きの変換など |
| `forms/` | 入力画面の状態・検証・API に送る形への変換(と、それをまとめる小さなフック) |
| `screens/` | 画面ごとのまとめ役のフック(夜の確認・余裕リスト・次の1件など)。画面は返り値を描くだけ |
| `hooks/` | 画面に依存しない汎用のフック(`useNow`) |

DOM・react-dom・wouter・firebase・JSX・Tailwind のクラス名は使わない(biome で弾く)。web 固有の処理はオプションや引数で受け取る。
