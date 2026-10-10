// Apps Script 用のバンドル。トリガーやメニューから呼ぶ関数だけをトップレベルに宣言する
import { mkdirSync, writeFileSync } from "node:fs";
import * as esbuild from "esbuild";

const HANDLERS = ["syncClassroom", "installTrigger", "checkConnection"];
const footer = HANDLERS.map((name) => `function ${name}() { return __bundle.${name}(); }`).join("\n");

const result = await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	write: false,
	format: "iife",
	globalName: "__bundle",
	target: "es2019",
	platform: "neutral",
	legalComments: "none",
	charset: "utf8",
	footer: { js: footer },
});
const code = result.outputFiles[0].text;
if (/^\s*(import|export)\s/m.test(code)) throw new Error("import/export が出力に残っています");

mkdirSync("dist", { recursive: true });
writeFileSync("dist/Code.js", code);
console.log("dist/Code.js を書き出しました");
