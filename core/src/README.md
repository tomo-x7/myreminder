# core

web と将来の Android(RN)アプリが共有する、プラットフォームに依存しない層。規則は [ai-docs/specs/client.md](../../ai-docs/specs/client.md)。

- `api/`: `createApi`(クライアント。`fetch`・`headers`・`onAuthError` は呼び出し側が渡す)、`ApiProvider` / `useApi`、`ApiError` と `unwrap`、API の入出力の型(`types.ts`。`worker` の `AppType` から導く)
- `queries/`: TanStack Query のキー(`keys.ts`)とフック。API はすべて `useApi()` で受け取ったクライアントで呼ぶ。React の外から呼ぶもの(`push.ts`)だけ、`api` を引数で受ける関数
- `domain/`: 純粋な関数と定数。日付・時刻の表示、リスク・進捗の言い方、下書きの変換と検証、エラーのコード → 文言(`errors.ts`)。Tailwind のクラスは持たない
- `hooks/`: API に依存しない React のフック(`useNow`)
