import { Hono } from "hono";
import type { Env } from "../env";

export const courses = new Hono<Env>();
