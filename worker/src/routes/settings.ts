import { Hono } from "hono";
import type { Env } from "../env";

export const settings = new Hono<Env>();
