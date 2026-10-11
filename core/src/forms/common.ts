// フォームの共通の小物
import { MINUTE } from "../domain/date";

/** 項目ごとの文言。問題のない項目は持たない */
export type Problems<K extends string> = Partial<Record<K, string>>;

/** 検証を通ったか(問題が1つもない) */
export const isValid = (problems: object) => Object.keys(problems).length === 0;

/** 画面が1行にまとめて出すとき用。最初の1件(検証の順に並べてある) */
export function firstProblem(problems: Readonly<Record<string, string | undefined>>): string | null {
	return Object.values(problems).find((m) => m !== undefined) ?? null;
}

/** 日時の入力は分の単位。秒以下は切り捨てる(入力欄の文字列にしたときと同じ) */
export const floorToMinute = (ms: number) => Math.floor(ms / MINUTE) * MINUTE;
