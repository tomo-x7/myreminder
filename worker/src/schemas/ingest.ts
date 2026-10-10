// 取り込み(POST /api/ingest/:source)の契約。Apps Script(gas/)もこの型を import type で使うので、valibot 以外を import しない
import * as v from "valibot";

export const INGEST_SOURCES = ["classroom", "webclass"] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export const ingestSourceParamSchema = v.object({ source: v.picklist(INGEST_SOURCES) });

const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

export const ingestItemSchema = v.object({
	/** 取り込み元の中で一意で、変わらない ID。Classroom は `${courseId}:${courseWorkId}` */
	externalId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	title: v.pipe(text(300), v.minLength(1)),
	courseName: v.optional(v.nullable(text(200)), null),
	/** 締切(epoch ミリ秒)。締切のない課題は null */
	dueAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))), null),
	/** 取り込み元で課題を開く URL */
	url: v.optional(v.nullable(v.pipe(v.string(), v.url(), v.maxLength(1000))), null),
	/** 提出状態。Classroom は studentSubmissions の state(CREATED / TURNED_IN / RETURNED / RECLAIMED_BY_STUDENT など) */
	remoteState: v.optional(v.nullable(text(50)), null),
	/** 課題の本文(切り詰めてよい)。受信箱で見せるだけ */
	description: v.optional(v.nullable(text(2000)), null),
	/** 取り込み元の種類(Classroom の workType など)。受信箱で見せるだけ */
	kind: v.optional(v.nullable(text(50)), null),
});

/** スナップショット全体。差分はサーバーで取るので、送る側は状態を持たない */
export const ingestSnapshotSchema = v.object({
	items: v.pipe(v.array(ingestItemSchema), v.maxLength(500)),
});

export type IngestItemInput = v.InferInput<typeof ingestItemSchema>;
export type IngestSnapshotInput = v.InferInput<typeof ingestSnapshotSchema>;
export type IngestSnapshot = v.InferOutput<typeof ingestSnapshotSchema>;

/** POST /api/ingest/:source の応答 */
export type IngestResult = {
	received: number;
	/** 受信箱に新しく入った件数 */
	created: number;
	/** 初めて見たが、提出済み・締切切れなので無視として覚えた件数 */
	autoIgnored: number;
	/** 内容が変わった件数(紐付け済みの反映・変更の提案を含む) */
	updated: number;
	unchanged: number;
};
