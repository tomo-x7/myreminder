// API の入出力の型。worker の AppType から導く(実行時のクライアントには依存しない)
import type { InferRequestType, InferResponseType } from "hono/client";
import type { Api } from "./client";

type A = Api["api"];

// タスク
export type Task = InferResponseType<A["tasks"]["$get"], 200>[number];
export type TaskCreate = InferRequestType<A["tasks"]["$post"]>["json"];
export type TaskPatch = InferRequestType<A["tasks"][":id"]["$patch"]>["json"];

// 繰り返し(シリーズ)。止めたものも含み、nextDueAt は締切が今より後の最初の回
export type Series = InferResponseType<A["series"]["$get"], 200>[number];
export type RepeatInput = InferRequestType<A["tasks"][":id"]["repeat"]["$post"]>["json"];

// 科目
export type Course = InferResponseType<A["courses"]["$get"], 200>[number];
export type CourseInput = InferRequestType<A["courses"]["$post"]>["json"];

// 予定(時間割・バイト・単発)
export type BusyBlock = InferResponseType<A["busy-blocks"]["$get"], 200>[number];
export type BusyBlockInput = InferRequestType<A["busy-blocks"]["$post"]>["json"];
export type BusyBlockPatch = InferRequestType<A["busy-blocks"][":id"]["$patch"]>["json"];

// 設定
export type Settings = InferResponseType<A["settings"]["$get"], 200>;
export type SettingsPatch = InferRequestType<A["settings"]["$patch"]>["json"];

// 計画
export type Plan = InferResponseType<A["schedule"]["$get"], 200>;
export type PlanTask = Plan["tasks"][number];
export type SlackList = InferResponseType<A["schedule"]["slack"]["$get"], 200>;
export type SlackItem = SlackList["items"][number];
export type WhatIf = InferResponseType<A["schedule"]["what-if"][":id"]["$get"], 200>;

// 状態・作業記録
export type EffectiveStatus = InferResponseType<A["status"]["$get"], 200>;
export type SetStatusInput = InferRequestType<A["status"]["$put"]>["json"];
export type SessionRow = InferResponseType<A["sessions"]["$get"], 200>[number];
export type SessionPatch = InferRequestType<A["sessions"][":id"]["$patch"]>["json"];
export type SessionCreate = InferRequestType<A["sessions"]["$post"]>["json"];

// 受信箱
export type Inbox = InferResponseType<A["inbox"]["$get"], 200>;
export type InboxItem = Inbox["pending"][number];
export type InboxCandidate = InboxItem["candidates"][number];
export type InboxChange = Inbox["changes"][number];
export type AcceptInput = InferRequestType<A["inbox"][":id"]["accept"]["$post"]>["json"];

// ふりかえり
export type Review = InferResponseType<A["review"]["$get"], 200>;
export type ReviewDay = Review["days"][number];

// webhook
export type Webhook = InferResponseType<A["webhooks"]["$get"], 200>[number];
export type WebhookCreate = InferRequestType<A["webhooks"]["$post"]>["json"];
export type WebhookPatch = InferRequestType<A["webhooks"][":id"]["$patch"]>["json"];
export type WebhookKind = Webhook["kind"];
export type WebhookEvent = Webhook["events"][number];

// 解析(クイック追加)
export type ParseResponse = InferResponseType<A["parse"]["line"]["$post"], 200>;
export type ParsedCandidate = ParseResponse["candidates"][number];
export type StartSuggestion = ParseResponse["startSuggestions"][number];
/** POST /api/parse/image の画像。web は File、RN は FormData に入れられる形 */
export type ParseImageFile = InferRequestType<A["parse"]["image"]["$post"]>["form"]["image"];
