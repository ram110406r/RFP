/**
 * The platform database schema — one source of truth for every app
 * (apps/api, apps/worker, apps/mcp, apps/legacy-api).
 *
 * Split by domain rather than kept in one file, so a change to knowledge
 * modelling doesn't force a reader through the RFP tables. Import order below
 * follows the dependency direction: organization → identity → knowledge →
 * rfp → audit, with platform hanging off organization/identity.
 */

export * from "./_shared";
export * from "./organization";
export * from "./identity";
export * from "./auth";
export * from "./membership";
export * from "./foundation";
export * from "./files";
export * from "./knowledge";
export * from "./tender";
export * from "./rfp";
export * from "./rfp-lifecycle";
export * from "./extraction";
export * from "./audit";
export * from "./platform";
export * from "./onboarding";
