import { Hono } from "hono";
import type { Env } from "../env";

export const parse = new Hono<Env>();
