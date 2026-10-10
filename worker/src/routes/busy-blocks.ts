import { Hono } from "hono";
import type { Env } from "../env";

export const busyBlocks = new Hono<Env>();
