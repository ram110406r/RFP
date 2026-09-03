import { z } from "zod";

export const ONBOARDING_JOURNEYS = ["COMPANY", "EMPLOYEE"] as const;
export const DEPARTMENTS = ["executive", "sales", "presales", "bid_management", "engineering", "product", "security", "legal", "finance", "operations", "other"] as const;
export const JOB_TITLES = ["founder", "executive", "proposal_manager", "bid_manager", "solutions_architect", "sales_manager", "security_manager", "legal_counsel", "product_manager", "engineer", "analyst", "other"] as const;

const websiteSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const website = value.trim();
    if (!website || /^[a-z][a-z\d+.-]*:\/\//i.test(website)) return website;
    return `https://${website}`;
  },
  z.string().url().max(240).optional().or(z.literal("")),
);

const timezoneSchema = z.string().trim().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "Use a valid IANA timezone such as Asia/Kolkata.");

export const journeySchema = z.object({
  journey: z.enum(ONBOARDING_JOURNEYS),
  invitationId: z.string().uuid().optional(),
});
export type JourneyInput = z.infer<typeof journeySchema>;

export const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional(),
  website: websiteSchema,
  industry: z.string().trim().max(120).optional(),
  companySize: z.string().trim().max(40).optional(),
  country: z.string().trim().max(80).optional(),
  operatingRegion: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  coreProducts: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  certifications: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});
export type CompanyInput = z.infer<typeof companySchema>;

export const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/),
  purpose: z.string().trim().max(500).optional(),
  timezone: timezoneSchema.default("UTC"),
  currency: z.string().trim().length(3).default("USD"),
});
export type WorkspaceInput = z.infer<typeof workspaceSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  preferredName: z.string().trim().max(80).default(""),
  jobTitle: z.enum(JOB_TITLES),
  department: z.enum(DEPARTMENTS),
  timezone: timezoneSchema,
  phone: z.string().trim().max(40).default(""),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const teamSchema = z.object({
  teams: z.array(z.string().trim().min(2).max(80)).max(20).default([]),
  invites: z.array(z.object({
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(["ADMIN", "RFP_MANAGER", "CONTRIBUTOR", "REVIEWER", "SME", "VIEWER"]).default("VIEWER"),
    proposedDepartment: z.enum(DEPARTMENTS).optional(),
    proposedTeamId: z.string().uuid().optional(),
  })).max(50).default([]),
});
export type TeamInput = z.infer<typeof teamSchema>;

export const invitationAcceptanceSchema = z.object({ invitationId: z.string().uuid() });
export const invitationTokenAcceptanceSchema = z.object({ token: z.string().trim().min(16).max(128) });

export const rfpContextSchema = z.object({
  rfpVolume: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  typicalRfpTypes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  mainIndustries: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  reviewProcess: z.string().trim().max(500).optional(),
  commonCategories: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});
export type RfpContextInput = z.infer<typeof rfpContextSchema>;
export const completeSchema = z.object({});
