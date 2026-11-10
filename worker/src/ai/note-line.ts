// 1行の明示的な「メモ」指定。自然文の途中のメモ・メモリなどには反応しない。
export function noteTitleFromLine(text: string): string | null {
	if (text.trim() === "メモ") return "";
	const match = /^メモ(?:[ \t\u3000]+|[:：])([\s\S]*)$/.exec(text.trimStart());
	return match ? match[1].trim() : null;
}
