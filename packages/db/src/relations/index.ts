/**
 * Drizzle `relations()` definitions, kept separate from the table
 * definitions in ../schema.
 *
 * Why the split: relations are what the query API (`db.query.rfps.findMany({
 * with: { requirements: true } })`) reads, but they emit no DDL — drizzle-kit
 * generates migrations from ../schema alone. Keeping them apart means a
 * relation can be added or reshaped with zero risk of producing a spurious
 * migration, and drizzle.config.ts can point at ../schema without qualifiers.
 *
 * client.ts merges both namespaces into the object handed to drizzle().
 */

export * from "./organization";
export * from "./identity";
export * from "./membership";
export * from "./foundation";
export * from "./tender-discovery";
export * from "./tender";
export * from "./knowledge";
export * from "./rfp";
export * from "./rfp-lifecycle";
export * from "./extraction";
