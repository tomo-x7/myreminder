import { Hono } from "hono";
import type { Env } from "../env";

export const push = new Hono<Env>();
