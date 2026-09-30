import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "./password-links";

export const startPasswordLinkSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(190),
});
export type StartPasswordLinkInput = z.infer<typeof startPasswordLinkSchema>;

export const completePasswordLinkSchema = z.object({
  token: z.string().trim().min(16).max(256),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(256),
  name: z.string().trim().max(120).optional(),
});
export type CompletePasswordLinkInput = z.infer<typeof completePasswordLinkSchema>;
