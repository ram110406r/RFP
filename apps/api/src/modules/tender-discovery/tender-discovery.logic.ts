import { BadRequestException } from "@nestjs/common";

export interface TenderMatchProfileInput {
  capabilityKeywords: string[];
  preferredCategories: string[];
  preferredStates: string[];
  certifications: string[];
  industry: string | null;
  minimumValue: number | null;
  maximumValue: number | null;
}

export interface MatchableNotice {
  title: string;
  description: string;
  buyerName: string | null;
  category: string | null;
  state: string | null;
  location: string | null;
  estimatedValue: string | number | null;
}

export function scoreTenderMatch(notice: MatchableNotice, profile: TenderMatchProfileInput | null) {
  if (!profile) return { score: 0, components: { capabilities: 0, industry: 0, region: 0, certifications: 0, value: 0 }, reasons: ["Profile information missing"] };
  const text = normalize([notice.title, notice.description, notice.buyerName, notice.category].filter(Boolean).join(" "));
  const location = normalize([notice.state, notice.location].filter(Boolean).join(" "));
  const hits = (values: string[], haystack: string) => values.filter((value) => haystack.includes(normalize(value)));
  const capabilityHits = hits(profile.capabilityKeywords, text);
  const categoryHits = hits(profile.preferredCategories, text);
  const certificationHits = hits(profile.certifications, text);
  const regionHits = hits(profile.preferredStates, location);
  const industryHit = profile.industry ? text.includes(normalize(profile.industry)) : false;
  const numericValue = notice.estimatedValue === null ? null : Number(notice.estimatedValue);
  const hasValuePreference = profile.minimumValue !== null || profile.maximumValue !== null;
  const valueHit = numericValue !== null && hasValuePreference && (profile.minimumValue === null || numericValue >= profile.minimumValue) && (profile.maximumValue === null || numericValue <= profile.maximumValue);
  const components = {
    capabilities: capabilityHits.length ? 35 : 0,
    industry: industryHit || categoryHits.length ? 20 : 0,
    region: regionHits.length ? 15 : 0,
    certifications: certificationHits.length ? 15 : 0,
    value: valueHit ? 15 : 0,
  };
  const reasons: string[] = [];
  if (capabilityHits.length) reasons.push(`Capability match: ${capabilityHits.slice(0, 3).join(", ")}`);
  if (industryHit || categoryHits.length) reasons.push(`Industry/category match: ${industryHit ? profile.industry : categoryHits.slice(0, 2).join(", ")}`);
  if (regionHits.length) reasons.push(`Region match: ${regionHits.slice(0, 2).join(", ")}`);
  if (certificationHits.length) reasons.push(`Certification mentioned: ${certificationHits.slice(0, 2).join(", ")}`);
  if (valueHit) reasons.push("Estimated value is within the preferred range");
  if (!reasons.length) reasons.push("No configured company-fit criteria matched");
  return { score: Object.values(components).reduce((sum, value) => sum + value, 0), components, reasons };
}

export function encodeCursor(value: Record<string, string | number | null>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") throw new Error("invalid");
    return parsed as { id: string; value: string | number | null };
  } catch {
    throw new BadRequestException({ code: "INVALID_CURSOR", message: "The tender search cursor is invalid or expired." });
  }
}

export function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
}
