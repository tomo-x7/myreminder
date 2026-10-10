import { Hono } from "hono";
import type { Env } from "../env";

export const status = new Hono<Env>();
