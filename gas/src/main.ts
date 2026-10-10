// Classroom の課題をスナップショットにして Worker へ送る(仕様: ai-docs/specs/ingest.md §5)
import type { IngestItemInput, IngestResult, IngestSnapshotInput } from "../../worker/src/schemas/ingest";

const HANDLER = "syncClassroom";
const DAY_MS = 24 * 60 * 60 * 1000;
/** 締切がこの期間より前の課題は送らない */
const WINDOW_MS = 7 * DAY_MS;
const MAX_ITEMS = 500;
const MAX_TITLE = 300;
const MAX_COURSE_NAME = 200;
const MAX_DESCRIPTION = 2000;

type Settings = { ingestUrl: string; clientId: string; clientSecret: string };

/** Script Properties から読む。コードには秘密情報を書かない */
function loadSettings(): Settings {
	const props = PropertiesService.getScriptProperties();
	const ingestUrl = props.getProperty("INGEST_URL");
	const clientId = props.getProperty("CF_ACCESS_CLIENT_ID");
	const clientSecret = props.getProperty("CF_ACCESS_CLIENT_SECRET");
	if (!ingestUrl || !clientId || !clientSecret) {
		throw new Error("Script Properties が足りません: INGEST_URL / CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET");
	}
	return { ingestUrl, clientId, clientSecret };
}

function requireClassroom(): GoogleAppsScript.Classroom {
	if (typeof Classroom === "undefined") {
		throw new Error("Classroom の拡張サービスが有効ではありません(サービス → Google Classroom API)");
	}
	return Classroom;
}

/** Worker を呼ぶ。200 以外は本文の先頭だけをログに出す。秘密情報は出さない */
function callWorker(s: Settings, url: string, method: "get" | "post", payload?: unknown): string | null {
	const res = UrlFetchApp.fetch(url, {
		method,
		contentType: "application/json",
		payload: payload === undefined ? undefined : JSON.stringify(payload),
		headers: { "CF-Access-Client-Id": s.clientId, "CF-Access-Client-Secret": s.clientSecret },
		muteHttpExceptions: true,
		// 302 は Access のログイン画面への転送なので、追わずに見せる
		followRedirects: false,
	});
	const code = res.getResponseCode();
	const body = res.getContentText();
	if (code === 200) return body;
	const hint = code === 302 || code === 401 || code === 403 ? "。Service Token を確認(期限切れも含む)" : "";
	console.error(`Worker への送信に失敗: HTTP ${code}${hint}: ${body.slice(0, 200)}`);
	return null;
}

/** pageToken を付けたパラメータを作る(最初のページは付けない) */
function page(args: object, token?: string): object {
	return token ? { ...args, pageToken: token } : args;
}

/** nextPageToken がなくなるまで全ページ取る */
function listAll<T, R extends { nextPageToken?: string | undefined }>(
	fetchPage: (token?: string) => R,
	pick: (res: R) => T[] | undefined,
): T[] {
	const out: T[] = [];
	let token: string | undefined;
	do {
		const res = fetchPage(token);
		out.push(...(pick(res) ?? []));
		token = res.nextPageToken || undefined;
	} while (token);
	return out;
}

/** 締切の変換。dueTime がなければ JST 23:59(UTC 14:59) */
function toDueAt(
	date?: GoogleAppsScript.Classroom.Schema.Date,
	time?: GoogleAppsScript.Classroom.Schema.TimeOfDay,
): number | null {
	if (!date || date.year === undefined || date.month === undefined || date.day === undefined) return null;
	const y = date.year;
	const m = date.month - 1;
	const d = date.day;
	if (!time) return Date.UTC(y, m, d, 14, 59);
	return Date.UTC(y, m, d, time.hours ?? 0, time.minutes ?? 0);
}

/** 1つのコースの課題を集める */
function collectCourse(
	api: GoogleAppsScript.Classroom,
	submissionsApi: GoogleAppsScript.Classroom.Collection.Courses.CourseWork.StudentSubmissionsCollection,
	course: GoogleAppsScript.Classroom.Schema.Course,
	courseId: string,
	now: number,
): IngestItemInput[] {
	const out: IngestItemInput[] = [];
	const works = listAll(
		(t) => api.Courses.CourseWork.list(courseId, page({ courseWorkStates: ["PUBLISHED"] }, t)),
		(r) => r.courseWork,
	);
	// courseWorkId に "-" を指定すると、このコースの自分の提出がすべて返る
	const subs = listAll(
		(t) => submissionsApi.list(courseId, "-", page({ userId: "me" }, t)),
		(r) => r.studentSubmissions,
	);
	const stateByWork = new Map<string, string>();
	for (const sub of subs) {
		if (sub.courseWorkId && sub.state) stateByWork.set(sub.courseWorkId, sub.state);
	}

	for (const w of works) {
		if (!w.id) continue;
		const dueAt = toDueAt(w.dueDate, w.dueTime);
		if (dueAt !== null && dueAt < now - WINDOW_MS) continue;

		out.push({
			externalId: `${courseId}:${w.id}`,
			title: (w.title?.trim() || "(無題の課題)").slice(0, MAX_TITLE),
			courseName: course.name ? course.name.slice(0, MAX_COURSE_NAME) : null,
			dueAt,
			url: w.alternateLink ?? null,
			remoteState: stateByWork.get(w.id) ?? null,
			description: w.description ? w.description.slice(0, MAX_DESCRIPTION) : null,
			kind: w.workType ?? null,
		});
	}
	return out;
}

export function syncClassroom(): void {
	const s = loadSettings();
	const api = requireClassroom();
	const submissionsApi = api.Courses.CourseWork.StudentSubmissions;
	if (!submissionsApi) throw new Error("Classroom の studentSubmissions が見つかりません");
	const now = Date.now();

	const courses = listAll(
		(t) => api.Courses.list(page({ courseStates: ["ACTIVE"] }, t)),
		(r) => r.courses,
	);

	const items: IngestItemInput[] = [];
	for (const course of courses) {
		const courseId = course.id;
		if (!courseId) continue;
		// 1つのコースで失敗しても、ほかのコースは送る(スナップショットにない課題をサーバーは消さない)
		try {
			items.push(...collectCourse(api, submissionsApi, course, courseId, now));
		} catch (e) {
			console.error(
				`コース「${course.name ?? courseId}」の取得に失敗: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	// 500件を超えたら締切の近い順に残す。締切なしは最後
	const rank = (x: number | null | undefined) => x ?? Number.MAX_SAFE_INTEGER;
	items.sort((a, b) => rank(a.dueAt) - rank(b.dueAt));
	const capped = items.slice(0, MAX_ITEMS);
	if (items.length > MAX_ITEMS)
		console.log(`課題が ${items.length} 件あったため、締切の近い ${MAX_ITEMS} 件だけ送ります`);

	const snapshot: IngestSnapshotInput = { items: capped };
	console.log(`コース ${courses.length} 件、課題 ${capped.length} 件を送信します`);
	const body = callWorker(s, s.ingestUrl, "post", snapshot);
	if (body === null) return;

	const r = JSON.parse(body) as IngestResult;
	console.log(
		`取り込み完了: 受信 ${r.received} / 新規 ${r.created} / 自動無視 ${r.autoIgnored} / 更新 ${r.updated} / 変化なし ${r.unchanged}`,
	);
}

/** syncClassroom を1時間ごとに実行するトリガーを作る。既存の同じトリガーは消してから作る */
export function installTrigger(): void {
	for (const trigger of ScriptApp.getProjectTriggers()) {
		if (trigger.getHandlerFunction() === HANDLER) ScriptApp.deleteTrigger(trigger);
	}
	ScriptApp.newTrigger(HANDLER).timeBased().everyHours(1).create();
	console.log(`${HANDLER} を1時間ごとに実行するトリガーを作りました`);
}

/** /api/ingest/ping で Service Token の設定を確かめる */
export function checkConnection(): void {
	const s = loadSettings();
	const pingUrl = s.ingestUrl.replace(/\/ingest\/[^/]+$/, "/ingest/ping");
	if (pingUrl === s.ingestUrl) {
		throw new Error("INGEST_URL は .../api/ingest/classroom の形で設定してください");
	}
	const body = callWorker(s, pingUrl, "get");
	if (body !== null) console.log(`接続OK: ${body}`);
}
