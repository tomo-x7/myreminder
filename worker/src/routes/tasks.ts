import { Hono } from "hono";
import type { Env } from "../env";

export const tasks = new Hono<Env>();
