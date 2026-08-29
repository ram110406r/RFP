/**
 * Shared platform types, consumed by every app in the monorepo.
 * Domain-specific (RFP) types live in the domain module that owns them,
 * not here — this package is for cross-cutting platform primitives only.
 */

export interface OrganizationScoped {
  organizationId: string;
}

export interface AuditActor {
  userId: string;
  organizationId: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
  };
}

export * from "./authz";
export * from "./evidence";
export * from "./tender";
