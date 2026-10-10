// AI が返した科目名を、登録済みの科目に結びつける
export type CourseRef = { id: string; name: string; aliases: string[] };

/** 大文字小文字・全半角・空白・記号の違いを無視するためのキー */
export function normalizeName(s: string): string {
	return s
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\s　・･、。,.\-_/()[\]{}（）【】「」『』〈〉<>:：;；'"`]/g, "");
}

// 短い名前同士の偶然の部分一致で別の科目に結びつけないための下限
const MIN_PARTIAL_LEN = 3;
const MIN_PARTIAL_RATIO = 0.5;

function partialMatch(a: string, b: string): boolean {
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	if (short.length < MIN_PARTIAL_LEN) return false;
	if (short.length / long.length < MIN_PARTIAL_RATIO) return false;
	return long.includes(short);
}

/**
 * 科目名の一致。完全一致(正規化後)を優先し、なければ部分一致の最長を採る。
 * 部分一致で同点の科目が複数あるときは、取り違えを避けて null
 */
export function matchCourse<C extends CourseRef>(name: string | null | undefined, courses: readonly C[]): C | null {
	if (!name) return null;
	const key = normalizeName(name);
	if (!key) return null;

	const keysOf = (c: CourseRef) => [c.name, ...c.aliases].map(normalizeName).filter(Boolean);

	for (const c of courses) {
		if (keysOf(c).includes(key)) return c;
	}

	let best: { course: C; len: number } | null = null;
	let tie = false;
	for (const c of courses) {
		let len = 0;
		for (const k of keysOf(c)) {
			if (partialMatch(key, k)) len = Math.max(len, Math.min(key.length, k.length));
		}
		if (len === 0) continue;
		if (!best || len > best.len) {
			best = { course: c, len };
			tie = false;
		} else if (len === best.len) {
			tie = true;
		}
	}
	return best && !tie ? best.course : null;
}

/** 時間割の表示名(label)がその科目か。label には「3限」などが付いていてもよい */
export function labelMatchesCourse(label: string, names: readonly string[]): boolean {
	const l = normalizeName(label);
	if (!l) return false;
	return names.some((n) => {
		const k = normalizeName(n);
		return (
			k !== "" && (l === k || partialMatch(l, k) || (k.length >= 2 && l.includes(k) && l.length - k.length <= 6))
		);
	});
}
