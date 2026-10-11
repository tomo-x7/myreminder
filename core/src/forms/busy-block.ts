// 時間割(繰り返し)・単発の予定のフォーム。時刻は JST 0時からの分、日付と日時は epoch ms で持つ
// (type=time / date / datetime-local の文字列との変換は画面の層。RN は Date を返すピッカーで足りる)
import { useState } from "react";
import type { BusyBlock, BusyBlockInput } from "../api/types";
import { HOUR, startOfJstDay } from "../domain/date";
import { errorText } from "../domain/errors";
import { type BusyKind, isOneOff, isRecurring, type Period } from "../domain/timetable";
import { useCreateBusyBlock, useDeleteBusyBlock, useUpdateBusyBlock } from "../queries/busy-blocks";
import { firstProblem, floorToMinute, isValid, type Problems } from "./common";

export type BlockShape = "recurring" | "oneoff";

export type BlockForm = {
	shape: BlockShape;
	kind: BusyKind;
	label: string;
	/** 繰り返しの曜日。0=日〜6=土 */
	weekday: number;
	startMin: number | null;
	endMin: number | null;
	/** 期間(学期)。JST のその日の 0:00。空でもよい */
	dateFrom: number | null;
	dateTo: number | null;
	/** 単発の開始・終了 */
	startAt: number | null;
	endAt: number | null;
};

/** 検証の順に並べてある(画面は firstProblem で最初の1件を出す) */
export type BlockFormProblems = Problems<"startMin" | "endMin" | "dateTo" | "startAt" | "endAt">;

/** 1日の終わり(24:00)は type=time で表せないので、これにそろえる */
const LAST_MINUTE = 1439;

export const emptyBlockForm = (defaultWeekday = 1): BlockForm => ({
	shape: "recurring",
	kind: "class",
	label: "",
	weekday: defaultWeekday,
	startMin: 9 * 60,
	endMin: 10 * 60 + 30,
	dateFrom: null,
	dateTo: null,
	startAt: null,
	endAt: null,
});

export function blockToForm(block: BusyBlock, defaultWeekday = 1): BlockForm {
	const common: BlockForm = { ...emptyBlockForm(defaultWeekday), kind: block.kind, label: block.label };
	if (isRecurring(block)) {
		return {
			...common,
			weekday: block.weekday,
			startMin: block.startMin,
			endMin: Math.min(block.endMin, LAST_MINUTE),
			dateFrom: block.dateFrom === null ? null : startOfJstDay(block.dateFrom),
			dateTo: block.dateTo === null ? null : startOfJstDay(block.dateTo),
		};
	}
	if (isOneOff(block)) {
		return { ...common, shape: "oneoff", startAt: floorToMinute(block.startAt), endAt: floorToMinute(block.endAt) };
	}
	return common;
}

export function validateBlockForm(f: BlockForm): BlockFormProblems {
	const problems: BlockFormProblems = {};
	if (f.shape === "recurring") {
		if (f.startMin === null || f.endMin === null) problems.startMin = "時刻が未入力";
		else if (f.endMin <= f.startMin) problems.endMin = "終了が開始より前";
		if (f.dateFrom !== null && f.dateTo !== null && f.dateTo < f.dateFrom)
			problems.dateTo = "期間の終了が開始より前";
	} else {
		if (f.startAt === null || f.endAt === null) problems.startAt = "日時が未入力";
		else if (f.endAt <= f.startAt) problems.endAt = "終了が開始より前";
	}
	return problems;
}

/** 検証済みの入力 → 保存内容(繰り返し/単発のどちらか。使わない側は null で消す)。validateBlockForm が通ったものだけ渡す */
export function toBlockInput(f: BlockForm): BusyBlockInput {
	const label = f.label.trim();
	if (f.shape === "recurring") {
		return {
			kind: f.kind,
			label,
			weekday: f.weekday,
			startMin: f.startMin as number,
			endMin: f.endMin as number,
			dateFrom: f.dateFrom,
			dateTo: f.dateTo,
			startAt: null,
			endAt: null,
		};
	}
	return {
		kind: f.kind,
		label,
		startAt: f.startAt as number,
		endAt: f.endAt as number,
		weekday: null,
		startMin: null,
		endMin: null,
		dateFrom: null,
		dateTo: null,
	};
}

/** 追加(defaultWeekday つきなら毎週のその曜日)・編集のフォームの状態。submit は検証を通ったときだけ onSave を呼ぶ */
export function useBlockForm(block: BusyBlock | undefined, defaultWeekday = 1) {
	const [form, setForm] = useState<BlockForm>(() =>
		block ? blockToForm(block, defaultWeekday) : emptyBlockForm(defaultWeekday),
	);
	const [problems, setProblems] = useState<BlockFormProblems>({});
	const set = <K extends keyof BlockForm>(key: K, value: BlockForm[K]) => setForm((f) => ({ ...f, [key]: value }));

	return {
		form,
		set,
		/** 単発に切り替えたとき、区分が授業のままなら予定にする(単発の授業はない) */
		setShape: (shape: BlockShape) =>
			setForm((f) => ({
				...f,
				shape,
				kind: shape === "oneoff" && f.kind === "class" ? "event" : f.kind,
			})),
		/** 終了が空なら、開始の1時間後を入れておく */
		setStartAt: (startAt: number | null) =>
			setForm((f) => ({
				...f,
				startAt,
				endAt: f.endAt === null && startAt !== null ? startAt + HOUR : f.endAt,
			})),
		/** 時限から選ぶ。その時限の開始・終了を入れる */
		pickPeriod: (p: Period) =>
			setForm((f) => ({ ...f, startMin: p.startMin, endMin: Math.min(p.endMin, LAST_MINUTE) })),
		isPeriodSelected: (p: Period) => form.startMin === p.startMin && form.endMin === p.endMin,
		/** 検証に引っかかった最初の1件。なければ null */
		problem: firstProblem(problems),
		submit(onSave: (input: BusyBlockInput) => void) {
			const found = validateBlockForm(form);
			setProblems(found);
			if (isValid(found)) onSave(toBlockInput(form));
		},
	};
}

/** 予定の保存と削除。終わったら onDone */
export function useBlockEditor(block: BusyBlock | undefined, onDone: () => void) {
	const create = useCreateBusyBlock();
	const update = useUpdateBusyBlock();
	const remove = useDeleteBusyBlock();
	const error = create.error ?? update.error ?? remove.error;

	return {
		saving: create.isPending || update.isPending || remove.isPending,
		error: error ? errorText(error) : null,
		save: (input: BusyBlockInput) =>
			block
				? update.mutate({ id: block.id, patch: input }, { onSuccess: onDone })
				: create.mutate(input, { onSuccess: onDone }),
		/** 新規のときは undefined */
		remove: block ? () => remove.mutate(block.id, { onSuccess: onDone }) : undefined,
	};
}
