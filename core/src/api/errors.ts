// API の失敗を1つの ApiError にそろえる。契約は ai-docs/specs/client.md「エラー」:
// 本文は `{ error: "<コード>", message?, issues? }`。旧い形や JSON でない本文も読めるようにしておく
type Fetched = { ok: boolean; status: number; json: () => Promise<unknown> };

export class ApiError extends Error {
	status: number;
	/** `overlap` `invalid_input` など。表示用の文言は domain/errors.ts の errorText で決める */
	code: string;
	/** `"<項目>: <理由>"` の並び(invalid_input など) */
	issues?: string[];

	/** message が無ければ code を message にする(errorText の最後の逃げ道) */
	constructor(init: { status: number; code: string; message?: string; issues?: string[] }) {
		super(init.message ?? init.code);
		this.name = "ApiError";
		this.status = init.status;
		this.code = init.code;
		this.issues = init.issues;
	}
}

/** 本文がコードを持たないときの、HTTP ステータスからのコード */
function codeFromStatus(status: number): string {
	if (status === 0 || status === 401 || status === 403) return "unauthorized";
	if (status === 400) return "invalid_input";
	if (status === 404) return "not_found";
	if (status === 413) return "too_large";
	if (status === 415) return "unsupported_media_type";
	if (status >= 500) return "internal";
	return "http_error";
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const strings = (v: unknown): string[] | undefined =>
	Array.isArray(v) && v.every((x) => typeof x === "string") ? v : undefined;

/** valibot の `{ success: false, error: [{ message, path? }] }`(旧い形)の issue を "項目: 理由" にする */
function legacyIssue(v: unknown): string | null {
	if (!isRecord(v) || typeof v.message !== "string") return null;
	const path = Array.isArray(v.path) ? v.path.map((p) => (isRecord(p) ? String(p.key) : String(p))).join(".") : "";
	return `${path}: ${v.message}`;
}

async function toApiError(res: Fetched): Promise<ApiError> {
	const body: unknown = await res.json().catch(() => null);
	if (isRecord(body)) {
		if (typeof body.error === "string") {
			return new ApiError({
				status: res.status,
				code: body.error,
				message: typeof body.message === "string" ? body.message : undefined,
				issues: strings(body.issues),
			});
		}
		if (Array.isArray(body.error)) {
			const issues = body.error.map(legacyIssue).filter((s): s is string => s !== null);
			return new ApiError({ status: res.status, code: "invalid_input", issues });
		}
	}
	return new ApiError({ status: res.status, code: codeFromStatus(res.status) });
}

/** 成功した応答のうち JSON の本文の型(Hono の応答の型は ok で絞れる) */
type OkBody<R> = R extends { ok: true; json: () => Promise<infer J> } ? J : never;

/** 成功なら本文の JSON を返し、失敗なら ApiError を投げる */
export async function unwrap<R extends Fetched>(res: R): Promise<OkBody<R>> {
	if (res.ok) return (await res.json()) as OkBody<R>;
	throw await toApiError(res);
}
