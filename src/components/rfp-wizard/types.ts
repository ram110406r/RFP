import { z } from "zod";
import type { RfpDocument } from "@/types";

export const detailsSchema = z.object({
  title: z.string().min(3, "Give this RFP a title"),
  customer: z.string().min(2, "Customer name is required"),
  opportunity: z.string().optional(),
  estimatedValue: z.coerce.number().min(0, "Enter a valid amount"),
  deadline: z
    .string()
    .min(1, "Set a submission deadline")
    .refine((v) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(v) >= today;
    }, "Deadline can't be in the past"),
  ownerId: z.string().min(1, "Assign an owner"),
});

export type DetailsValues = z.infer<typeof detailsSchema>;

export interface WizardDocument {
  id: string;
  name: string;
  type: RfpDocument["type"];
  sizeMb: number;
  status: "uploading" | "uploaded" | "failed";
}

export interface ProcessingPreferences {
  analyzeRequirements: boolean;
  detectMandatory: boolean;
  detectRisks: boolean;
  searchKnowledge: boolean;
  generateInitialAnswers: boolean;
}

export const DEFAULT_PREFERENCES: ProcessingPreferences = {
  analyzeRequirements: true,
  detectMandatory: true,
  detectRisks: true,
  searchKnowledge: true,
  generateInitialAnswers: true,
};

export const RFP_CATEGORIES = [
  "Technical",
  "Security",
  "Commercial",
  "Legal",
  "Compliance",
  "Product",
  "Implementation",
] as const;

export type WizardCategory = (typeof RFP_CATEGORIES)[number];

export interface ConfigureValues {
  responseDeadline: string;
  ownerId: string;
  collaboratorIds: string[];
  categories: WizardCategory[];
  preferences: ProcessingPreferences;
}

export type WizardStepId = "details" | "documents" | "configure" | "analyze";

export const WIZARD_STEPS: { id: WizardStepId; index: number; label: string }[] = [
  { id: "details", index: 1, label: "Details" },
  { id: "documents", index: 2, label: "Documents" },
  { id: "configure", index: 3, label: "Configure" },
  { id: "analyze", index: 4, label: "Analyze" },
];

export function formatDateLabel(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(value: number): string {
  return inrFormatter.format(value || 0);
}
