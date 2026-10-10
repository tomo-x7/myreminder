import { Hono } from "hono";
import type { Env } from "../env";

export const sessions = new Hono<Env>();
