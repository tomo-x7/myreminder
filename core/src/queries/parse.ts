// クイック追加の解析(POST /api/parse/*)。失敗しても例外にせず、手入力用の空のカードを返す
import { useMutation } from "@tanstack/react-query";
import type { Api } from "../api/client";
import { useApi } from "../api/context";
import type { ParseImageFile, StartSuggestion } from "../api/types";
import { candidateToDraft, draftTitle, emptyDraft, type ParseMode } from "../domain/draft";
import type { Draft } from "../domain/draft-types";

export type ParseOutcome = {
	drafts: Draft[];
	startSuggestions: StartSuggestion[];
	now: number;
	/** 解析に失敗/空だったときの案内。drafts は手入力用の空カード */
	notice: string | null;
	/** 解析に失敗した告知文の本文。手入力のときに見比べられるよう確認画面に残す */
	pasted: string | null;
};

/** 解析の入力。image は選ばれた写真(web は Blob、RN は uri など)。縮小は prepareImage の仕事 */
export type ParseInput<Img> = { mode: ParseMode; text: string } | { image: Img };

const FAILED = "解析できなかった";

async function parseText(api: Api, mode: ParseMode, text: string): Promise<ParseOutcome> {
	const fallback = (notice: string): ParseOutcome => ({
		drafts: [emptyDraft(draftTitle(mode, text))],
		startSuggestions: [],
		now: Date.now(),
		notice,
		pasted: mode === "text" ? text : null,
	});
	try {
		const res =
			mode === "line"
				? await api.api.parse.line.$post({ json: { text } })
				: await api.api.parse.text.$post({ json: { text } });
		if (!res.ok) return fallback(FAILED);
		const data = await res.json();
		if (data.candidates.length === 0) {
			const out = fallback(data.error ?? FAILED);
			return { ...out, startSuggestions: data.startSuggestions, now: data.now };
		}
		return {
			drafts: data.candidates.map(candidateToDraft),
			startSuggestions: data.startSuggestions,
			now: data.now,
			notice: null,
			pasted: null,
		};
	} catch {
		return fallback("通信エラー");
	}
}

async function parseImage<Img>(
	api: Api,
	image: Img,
	prepareImage: (image: Img) => Promise<ParseImageFile>,
): Promise<ParseOutcome> {
	const fallback = (notice: string): ParseOutcome => ({
		drafts: [emptyDraft("")],
		startSuggestions: [],
		now: Date.now(),
		notice,
		pasted: null,
	});
	try {
		const res = await api.api.parse.image.$post({ form: { image: await prepareImage(image) } });
		if (res.status === 413) return fallback("画像は 1.5MB まで");
		if (!res.ok) return fallback(FAILED);
		const data = await res.json();
		if (data.candidates.length === 0) {
			const out = fallback(data.error ?? FAILED);
			return { ...out, startSuggestions: data.startSuggestions, now: data.now };
		}
		return {
			drafts: data.candidates.map(candidateToDraft),
			startSuggestions: data.startSuggestions,
			now: data.now,
			notice: null,
			pasted: null,
		};
	} catch {
		return fallback("写真を読み込めなかった");
	}
}

/**
 * 1行・告知文・写真を解析して確認カードの下書きにする。
 * prepareImage は送る前の画像の縮小(web は canvas、アプリは expo-image-manipulator など)。アップロード用の形で返す
 */
export function useParse<Img = Blob>(
	prepareImage: (image: Img) => Promise<ParseImageFile>,
	options?: { onSuccess?: (outcome: ParseOutcome) => void },
) {
	const api = useApi();
	return useMutation({
		mutationFn: (input: ParseInput<Img>) =>
			"image" in input ? parseImage(api, input.image, prepareImage) : parseText(api, input.mode, input.text),
		onSuccess: options?.onSuccess,
	});
}
