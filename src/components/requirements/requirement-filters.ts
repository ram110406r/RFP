import type { Requirement, RequirementCategory, RequirementStatus, RiskLevel } from "@/types";

/**
 * Typed, multi-value filter state for the requirements table. Every field is
 * an array (or boolean) so a single filter dimension can match several
 * values at once — e.g. `risks: ["high", "critical"]` — instead of the
 * single-value-per-field limitation the workspace used to have.
 */
export interface RequirementFilters {
  categories: RequirementCategory[];
  risks: RiskLevel[];
  statuses: RequirementStatus[];
  ownerTeams: string[];
  mandatoryOnly: boolean;
  missingEvidence: boolean;
  mine: boolean;
}

export const EMPTY_FILTERS: RequirementFilters = {
  categories: [],
  risks: [],
  statuses: [],
  ownerTeams: [],
  mandatoryOnly: false,
  missingEvidence: false,
  mine: false,
};

/**
 * Seed shape for filters coming from outside the table (URL search params,
 * saved views, validation deep links) — every field explicitly allows
 * `undefined` so it's assignable from zod's `.optional()`-inferred types
 * under `exactOptionalPropertyTypes`.
 */
export interface RequirementFilterSeed {
  categories?: RequirementCategory[] | undefined;
  risks?: RiskLevel[] | undefined;
  statuses?: RequirementStatus[] | undefined;
  ownerTeams?: string[] | undefined;
  mandatoryOnly?: boolean | undefined;
  missingEvidence?: boolean | undefined;
  mine?: boolean | undefined;
}

export function mergeFilters(seed: RequirementFilterSeed | undefined): RequirementFilters {
  return {
    categories: seed?.categories ?? EMPTY_FILTERS.categories,
    risks: seed?.risks ?? EMPTY_FILTERS.risks,
    statuses: seed?.statuses ?? EMPTY_FILTERS.statuses,
    ownerTeams: seed?.ownerTeams ?? EMPTY_FILTERS.ownerTeams,
    mandatoryOnly: seed?.mandatoryOnly ?? EMPTY_FILTERS.mandatoryOnly,
    missingEvidence: seed?.missingEvidence ?? EMPTY_FILTERS.missingEvidence,
    mine: seed?.mine ?? EMPTY_FILTERS.mine,
  };
}

export function isFiltersEmpty(filters: RequirementFilters): boolean {
  return (
    filters.categories.length === 0 &&
    filters.risks.length === 0 &&
    filters.statuses.length === 0 &&
    filters.ownerTeams.length === 0 &&
    !filters.mandatoryOnly &&
    !filters.missingEvidence &&
    !filters.mine
  );
}

export function applyRequirementFilters(
  list: Requirement[],
  filters: RequirementFilters,
  currentUserId: string,
): Requirement[] {
  let result = list;
  if (filters.categories.length) {
    result = result.filter((r) => filters.categories.includes(r.category));
  }
  if (filters.risks.length) {
    result = result.filter((r) => filters.risks.includes(r.risk));
  }
  if (filters.statuses.length) {
    result = result.filter((r) => filters.statuses.includes(r.status));
  }
  if (filters.ownerTeams.length) {
    result = result.filter((r) => filters.ownerTeams.includes(r.ownerTeam));
  }
  if (filters.mandatoryOnly) {
    result = result.filter((r) => r.mandatory);
  }
  if (filters.missingEvidence) {
    result = result.filter((r) => r.evidenceIds.length === 0);
  }
  if (filters.mine) {
    result = result.filter((r) => r.reviewerId === currentUserId);
  }
  return result;
}

export interface SavedView {
  id: string;
  label: string;
  filters: RequirementFilterSeed;
}

export const SAVED_VIEWS: SavedView[] = [
  { id: "all", label: "All Requirements", filters: {} },
  { id: "mine", label: "My Requirements", filters: { mine: true } },
  { id: "high-risk", label: "High Risk", filters: { risks: ["high", "critical"] } },
  { id: "needs-review", label: "Needs Review", filters: { statuses: ["needs_review"] } },
  { id: "missing-evidence", label: "Missing Evidence", filters: { missingEvidence: true } },
  { id: "critical", label: "Critical", filters: { risks: ["critical"] } },
];
