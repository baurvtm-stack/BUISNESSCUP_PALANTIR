import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const kitSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{6,32}$/);
// Shared by the server and device storage; this module contains no provider credentials.
export const proAccessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
