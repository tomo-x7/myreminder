import { Hono } from "hono";
import type { Env } from "../env";

export const webhooks = new Hono<Env>();
