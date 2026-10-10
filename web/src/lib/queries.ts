// TanStack Query のフック。キーは全画面で共有する(QuickAdd の ["courses"] と同じ)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "./api";

export type Task = InferResponseType<typeof api.api.tasks.$get, 200>[number];
export type TaskPatch = InferRequestType<(typeof api.api.tasks)[":id"]["$patch"]>["json"];
export type TaskCreate = InferRequestType<typeof api.api.tasks.$post>["json"];
export type Course = InferResponseType<typeof api.api.courses.$get, 200>[number];
export type CourseInput = InferRequestType<typeof api.api.courses.$post>["json"];
export type BusyBlock = InferResponseType<(typeof api.api)["busy-blocks"]["$get"], 200>[number];
export type BusyBlockInput = InferRequestType<(typeof api.api)["busy-blocks"]["$post"]>["json"];
export type Settings = InferResponseType<typeof api.api.settings.$get, 200>;
export type SettingsPatch = InferRequestType<typeof api.api.settings.$patch>["json"];

export const queryKeys = {
	tasks: ["tasks"],
	courses: ["courses"],
	busyBlocks: ["busy-blocks"],
	settings: ["settings"],
} as const;

class HttpError extends Error {
	status: number;
	constructor(status: number) {
		super(`HTTP ${status}`);
		this.status = status;
	}
}

type Fetched = { ok: boolean; status: number };
function assertOk(res: Fetched) {
	if (!res.ok) throw new HttpError(res.status);
}

export const useTasks = () =>
	useQuery({
		queryKey: queryKeys.tasks,
		queryFn: async () => {
			const res = await api.api.tasks.$get({ query: {} });
			assertOk(res);
			return (await res.json()) as Task[];
		},
	});

export const useTask = (id: string) =>
	useQuery({
		queryKey: [...queryKeys.tasks, id],
		queryFn: async () => {
			const res = await api.api.tasks[":id"].$get({ param: { id } });
			assertOk(res);
			return (await res.json()) as Task;
		},
	});

export const useCourses = () =>
	useQuery({
		queryKey: queryKeys.courses,
		queryFn: async () => {
			const res = await api.api.courses.$get();
			assertOk(res);
			return res.json();
		},
	});

export const useBusyBlocks = () =>
	useQuery({
		queryKey: queryKeys.busyBlocks,
		queryFn: async () => {
			const res = await api.api["busy-blocks"].$get();
			assertOk(res);
			return res.json();
		},
	});

export const useSettings = () =>
	useQuery({
		queryKey: queryKeys.settings,
		queryFn: async () => {
			const res = await api.api.settings.$get();
			assertOk(res);
			return res.json();
		},
	});

/** 更新系の mutation を作り、成功したらその key を無効化する */
function useInvalidatingMutation<V, R>(mutationFn: (v: V) => Promise<R>, key: readonly unknown[]) {
	const qc = useQueryClient();
	return useMutation({ mutationFn, onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
}

export const useCreateTasks = () =>
	useInvalidatingMutation(async (inputs: TaskCreate[]) => {
		// 順番に保存する(途中で失敗したら、そこで止めて画面に出す)
		for (const json of inputs) assertOk(await api.api.tasks.$post({ json }));
	}, queryKeys.tasks);

export const useUpdateTask = () =>
	useInvalidatingMutation(async ({ id, patch }: { id: string; patch: TaskPatch }) => {
		assertOk(await api.api.tasks[":id"].$patch({ param: { id }, json: patch }));
	}, queryKeys.tasks);

/** 削除した本人の詳細画面が 404 を再取得しないよう、無効化は待たずに先へ進む */
export function useDeleteTask() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			assertOk(await api.api.tasks[":id"].$delete({ param: { id } }));
		},
		onSuccess: (_, id) => {
			qc.removeQueries({ queryKey: [...queryKeys.tasks, id], exact: true });
			void qc.invalidateQueries({ queryKey: queryKeys.tasks });
		},
	});
}

export const useCreateCourse = () =>
	useInvalidatingMutation(async (json: CourseInput) => {
		assertOk(await api.api.courses.$post({ json }));
	}, queryKeys.courses);

export const useUpdateCourse = () =>
	useInvalidatingMutation(async ({ id, patch }: { id: string; patch: Partial<CourseInput> }) => {
		assertOk(await api.api.courses[":id"].$patch({ param: { id }, json: patch }));
	}, queryKeys.courses);

/** 科目を消すと、タスクの courseId が null になるのでタスクも更新する */
export function useDeleteCourse() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			assertOk(await api.api.courses[":id"].$delete({ param: { id } }));
		},
		onSuccess: () =>
			Promise.all([
				qc.invalidateQueries({ queryKey: queryKeys.courses }),
				qc.invalidateQueries({ queryKey: queryKeys.tasks }),
			]),
	});
}

export const useCreateBusyBlock = () =>
	useInvalidatingMutation(async (json: BusyBlockInput) => {
		assertOk(await api.api["busy-blocks"].$post({ json }));
	}, queryKeys.busyBlocks);

export const useUpdateBusyBlock = () =>
	useInvalidatingMutation(async ({ id, patch }: { id: string; patch: BusyBlockPatch }) => {
		assertOk(await api.api["busy-blocks"][":id"].$patch({ param: { id }, json: patch }));
	}, queryKeys.busyBlocks);

export type BusyBlockPatch = InferRequestType<(typeof api.api)["busy-blocks"][":id"]["$patch"]>["json"];

export const useDeleteBusyBlock = () =>
	useInvalidatingMutation(async (id: string) => {
		assertOk(await api.api["busy-blocks"][":id"].$delete({ param: { id } }));
	}, queryKeys.busyBlocks);

export const useUpdateSettings = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: SettingsPatch) => {
			const res = await api.api.settings.$patch({ json });
			assertOk(res);
			return res.json();
		},
		onSuccess: (data) => qc.setQueryData(queryKeys.settings, data),
	});
};
