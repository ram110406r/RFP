import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const updateProfileSchema = z
  .object({
    displayName: optionalText(120),
    preferredName: optionalText(120),
    jobTitle: optionalText(120),
    department: optionalText(120),
    timezone: optionalText(80),
    phone: optionalText(80),
    location: optionalText(160),
    language: optionalText(40),
    bio: optionalText(1_000),
    skills: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    notificationPreferences: z.record(z.boolean()).optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
