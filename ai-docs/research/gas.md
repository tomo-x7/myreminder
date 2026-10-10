# 調査メモ: Apps Script(TypeScript+esbuild、手動コピペでデプロイ)

2026-10-11 にサブエージェントが公式ドキュメントと npm で確認した。**未確認** と書いたものは裏が取れていない。

## ビルド

- Apps Script のエディタの実行メニューやトリガーの選択肢に出るのは、トップレベルの `function foo() {}` 宣言だけ
- 方式の比較:
  - `format: "iife"` で `globalThis` に代入する: トリガーの選択肢に出る保証がない(**未確認**)
  - `format: "esm"` にして `export` を削る: `export` が1つ残るだけで壊れる
  - `esbuild-gas-plugin`: 最新は 0.10.0(2025-07)で、更新が止まっている
- **採用**: `format: "iife"` + `globalName: "__bundle"` + footer で、トリガーから呼ぶ関数をトップレベルに明示的に宣言する
- target は `es2019`
  - V8 ランタイムは class、let/const、async/await をサポートしている
  - `?.` / `??` はドキュメントに記載がない
  - `async` を書いても `UrlFetchApp.fetch` は同期的にブロックするので、並行にはならない
  - `import` / `export` / `setTimeout` / `fetch` は使えない
- 型: `@types/google-apps-script@2.0.13`(2026-09)。Classroom の拡張サービスの型(`apis/classroom_v1.d.ts`)を含む
- tsconfig: `"lib": ["es2019"]`、`"types": ["google-apps-script"]`、DOM なし。型チェックは `tsc --noEmit`

```js
// gas/build.mjs
import * as esbuild from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

// Apps Script からトップレベル関数として見える必要がある名前(エディタのメニューとトリガー)
const HANDLERS = ["syncClassroom"];
const footer = HANDLERS.map((n) => `function ${n}() { return __bundle.${n}(); }`).join("\n");

const result = await esbuild.build({
	entryPoints: ["src/index.ts"], // ここから HANDLERS を export する
	bundle: true,
	write: false,
	format: "iife",
	globalName: "__bundle",
	target: "es2019",
	platform: "neutral",
	legalComments: "none",
	footer: { js: footer },
});
const code = result.outputFiles[0].text;
if (/^\s*(import|export)\s/m.test(code)) throw new Error("import/export leaked into GAS output");
mkdirSync("dist", { recursive: true });
writeFileSync("dist/Code.js", code);
```

## マニフェスト(`appsscript.json`)

- 既定のランタイムは Rhino(ES5)なので、`"runtimeVersion": "V8"` を必ず指定する
- エディタの設定で「appsscript.json をエディタで表示する」を有効にしてからコピペする
- Classroom の拡張サービスは、エディタの「サービス」→「追加」からも有効にできる

```json
{
	"timeZone": "Asia/Tokyo",
	"runtimeVersion": "V8",
	"dependencies": {
		"enabledAdvancedServices": [{ "userSymbol": "Classroom", "serviceId": "classroom", "version": "v1" }]
	},
	"oauthScopes": [
		"https://www.googleapis.com/auth/classroom.courses.readonly",
		"https://www.googleapis.com/auth/classroom.coursework.me.readonly",
		"https://www.googleapis.com/auth/script.external_request"
	],
	"exceptionLogging": "STACKDRIVER"
}
```

- スコープについて:
  - `classroom.coursework.me.readonly` は courseWork.list と studentSubmissions.list(`userId: "me"`)の両方に使える
  - `serviceId: "classroom"` と `script.external_request` は記憶からの記述で、**未確認**
- トリガーをエディタから手で作るなら、`script.scriptapp` は不要

## 実行環境と上限

- 時間主導型トリガーは作成したアカウントの権限で動く。そのアカウントがドメインから外れると止まる
- 時間主導型トリガーは最短で毎分にできる
- クォータ(Workspace の場合): トリガーの合計実行時間は 6h/日、UrlFetch は 10万回/日、1回の実行は最大6分
- 秘密情報(Service Token の Client ID / Secret、送信先 URL)は `PropertiesService.getScriptProperties()` に入れる。プロジェクトの編集権限がある人は誰でも読める
- 管理者がアプリや外部へのリクエストを制限している可能性がある(本人の大学では Apps Script が使えることを確認済み)

## Classroom API

- `courses.list`: `courseStates: ["ACTIVE"]` で絞る(既定はすべての状態)
- `courseWork.list`: `courseWorkStates: ["PUBLISHED"]` を明示する(既定値についてはドキュメント内で記述が矛盾している)
- `CourseWork.dueDate` と `dueTime` はどちらも **UTC**。dueDate があれば dueTime も必須。変換は `Date.UTC(y, m - 1, d, h, min)` で行う
- `alternateLink`(Classroom 上の URL)は PUBLISHED の課題にだけ入っている
- 提出の `state`: `CREATED` / `TURNED_IN` / `RETURNED` / `RECLAIMED_BY_STUDENT` / `STUDENT_EDITED_AFTER_TURN_IN`
  - `late` は boolean
- ページング: `nextPageToken` がなくなるまで `pageToken` に渡す。他のパラメータは呼び出しの間で変えない

出典:

- https://developers.google.com/apps-script/guides/v8-runtime
- https://developers.google.com/apps-script/manifest
- https://developers.google.com/apps-script/guides/services/advanced
- https://developers.google.com/apps-script/guides/triggers/installable
- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/classroom/reference/rest/v1/courses.courseWork
- https://developers.google.com/classroom/reference/rest/v1/courses.courseWork.studentSubmissions/list
