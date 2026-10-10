import { Hono } from "hono";
import type { Env } from "../env";

export const schedule = new Hono<Env>();
