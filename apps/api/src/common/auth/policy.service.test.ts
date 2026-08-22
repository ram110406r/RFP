import { describe, expect, it } from "bun:test";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { PolicyService } from "./policy.service";

interface PolicyRow {
  role: string | null;
  resource: string;
  action: string;
  effect: "allow" | "deny";
  condition: Record<string, unknown> | null;
  priority: number;
  description: string;
  organizationId: string;
}

/**
 * Stands in for the database. The service builds one filtered query, so the
 * stub applies the same filter in memory and hands back the rows — keeping the
 * test about policy evaluation rather than about Drizzle.
 */
function stubDb(rows: PolicyRow[], auth: AuthContext) {
  const matching = rows.filter(
    (row) =>
      row.organizationId === auth.organizationId && (row.role === null || row.role === auth.role),
  );
  return {
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => Promise.resolve(matching),
      }),
    }),
  } as never;
}

const auth: AuthContext = {
  userId: "user-1",
  organizationId: "org-1",
  role: "REVIEWER",
  permissions: permissionsForRole("REVIEWER"),
  sessionId: "session-1",
};

function policy(overrides: Partial<PolicyRow> = {}): PolicyRow {
  return {
    organizationId: "org-1",
    role: null,
    resource: "requirement",
    action: "approve",
    effect: "allow",
    condition: null,
    priority: 0,
    description: "",
    ...overrides,
  };
}

describe("PolicyService", () => {
  it("allows when the organization has no policies for the resource", async () => {
    const service = new PolicyService(stubDb([], auth));
    await expect(service.evaluate(auth, "requirement", "approve")).resolves.toEqual({
      allowed: true,
    });
  });

  it("denies when a matching deny policy applies", async () => {
    const rows = [policy({ effect: "deny", description: "Critical needs a specialist." })];
    const service = new PolicyService(stubDb(rows, auth));
    const decision = await service.evaluate(auth, "requirement", "approve");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Critical needs a specialist.");
  });

  it("lets deny win over an allow at higher priority", async () => {
    const rows = [
      policy({ effect: "allow", priority: 100 }),
      policy({ effect: "deny", priority: 1, description: "blocked" }),
    ];
    const service = new PolicyService(stubDb(rows, auth));
    await expect(service.evaluate(auth, "requirement", "approve")).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("only applies a conditional policy when the attributes match", async () => {
    const rows = [policy({ effect: "deny", condition: { risk: "critical" } })];
    const service = new PolicyService(stubDb(rows, auth));

    await expect(
      service.evaluate(auth, "requirement", "approve", { risk: "critical" }),
    ).resolves.toMatchObject({ allowed: false });

    await expect(
      service.evaluate(auth, "requirement", "approve", { risk: "low" }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("resolves $subject references against the caller", async () => {
    const rows = [
      policy({
        effect: "deny",
        description: "You cannot approve your own draft.",
        condition: { authorId: "$subject.userId" },
      }),
    ];
    const service = new PolicyService(stubDb(rows, auth));

    await expect(
      service.evaluate(auth, "requirement", "approve", { authorId: "user-1" }),
    ).resolves.toMatchObject({ allowed: false });

    await expect(
      service.evaluate(auth, "requirement", "approve", { authorId: "user-2" }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("ignores policies belonging to another organization", async () => {
    const rows = [policy({ organizationId: "org-2", effect: "deny" })];
    const service = new PolicyService(stubDb(rows, auth));
    await expect(service.evaluate(auth, "requirement", "approve")).resolves.toEqual({
      allowed: true,
    });
  });

  it("ignores policies scoped to a different role", async () => {
    const rows = [policy({ role: "CONTRIBUTOR", effect: "deny" })];
    const service = new PolicyService(stubDb(rows, auth));
    await expect(service.evaluate(auth, "requirement", "approve")).resolves.toEqual({
      allowed: true,
    });
  });
});
