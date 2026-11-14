import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const kitSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{6,32}$/);
