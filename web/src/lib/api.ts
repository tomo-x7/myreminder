import { hc } from "hono/client";
import type { AppType } from "worker";

// AppType は basePath("/api") を含むので、origin だけを渡す。dev では Vite の proxy が /api を worker に流す
export const api = hc<AppType>(location.origin);
