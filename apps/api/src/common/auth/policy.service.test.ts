import { describe, expect, it } from "bun:test";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { PolicyService } from "./policy.service";

interface PolicyRow {
  id: string;
  workspaceId: string | null;
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
function stubDb(rows: PolicyRow[], auth: AuthContext, counter?: { selects: number }) {
  const matching = rows.filter(
    (row) =>
      row.organizationId === auth.organizationId && (row.role === null || row.role === auth.role),
  );
  // Both the policy query and the condition query resolve to the same rows;
  // policy rows carry no `attribute`, so the service drops them as conditions.
  return {
    select: () => {
      if (counter) counter.selects += 1;
      return {
        from: () => ({
          where: (..._args: unknown[]) => Promise.resolve(matching),
        }),
      };
    },
  } as never;
}

const auth: AuthContext = {
  userId: "user-1",
  organizationId: "org-1",
  role: "REVIEWER",
  permissions: permissionsForRole("REVIEWER"),
  sessionId: "session-1",
};

let nextPolicyId = 0;

function policy(overrides: Partial<PolicyRow> = {}): PolicyRow {
  nextPolicyId += 1;
  return {
    id: `policy-${nextPolicyId}`,
    workspaceId: null,
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

  it("reports the deny policy that actually matched, not the first deny loaded", async () => {
    const rows = [
      policy({ effect: "deny", condition: { risk: "low" }, description: "Low risk is blocked." }),
      policy({ effect: "deny", condition: { risk: "critical" }, description: "Critical needs a specialist." }),
    ];
    const service = new PolicyService(stubDb(rows, auth));
    const decision = await service.evaluate(auth, "requirement", "approve", { risk: "critical" });
    expect(decision).toEqual({ allowed: false, reason: "Critical needs a specialist." });
  });

  it("applies a workspace-pinned policy only to resources in that workspace", async () => {
    const rows = [policy({ effect: "deny", workspaceId: "workspace-a", description: "Frozen in A." })];
    const service = new PolicyService(stubDb(rows, auth));
    const [inA, inB, noWorkspace] = await service.evaluateMany(auth, "requirement", "approve", [
      { workspaceId: "workspace-a" },
      { workspaceId: "workspace-b" },
      {},
    ]);
    expect(inA).toEqual({ allowed: false, reason: "Frozen in A." });
    expect(inB).toEqual({ allowed: true });
    expect(noWorkspace).toEqual({ allowed: true });
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
  describe("evaluateMany", () => {
    it("returns one decision per attribute set, in order", async () => {
      const rows = [policy({ effect: "deny", description: "No critical.", condition: { risk: "critical" } })];
      const service = new PolicyService(stubDb(rows, auth));
      const decisions = await service.evaluateMany(auth, "requirement", "approve", [
        { risk: "low" },
        { risk: "critical" },
        { risk: "medium" },
      ]);
      expect(decisions).toEqual([
        { allowed: true },
        { allowed: false, reason: "No critical." },
        { allowed: true },
      ]);
    });

    it("loads policies and conditions once for the whole batch", async () => {
      const counter = { selects: 0 };
      const rows = [policy({ effect: "deny", condition: { risk: "critical" } })];
      const service = new PolicyService(stubDb(rows, auth, counter));
      await service.evaluateMany(
        auth,
        "requirement",
        "approve",
        Array.from({ length: 25 }, (_, index) => ({ risk: index % 2 ? "critical" : "low" })),
      );
      expect(counter.selects).toBe(2);
    });

    it("allows everything with a single query when no policies apply", async () => {
      const counter = { selects: 0 };
      const service = new PolicyService(stubDb([], auth, counter));
      await expect(
        service.evaluateMany(auth, "requirement", "approve", [{}, { risk: "critical" }]),
      ).resolves.toEqual([{ allowed: true }, { allowed: true }]);
      expect(counter.selects).toBe(1);
    });

    it("skips the database for an empty batch", async () => {
      const counter = { selects: 0 };
      const service = new PolicyService(stubDb([policy({ effect: "deny" })], auth, counter));
      await expect(service.evaluateMany(auth, "requirement", "approve", [])).resolves.toEqual([]);
      expect(counter.selects).toBe(0);
    });

    it("matches evaluate() for each item", async () => {
      const rows = [policy({ effect: "deny", condition: { authorId: "$subject.userId" } })];
      const service = new PolicyService(stubDb(rows, auth));
      const attributes = [{ authorId: "user-1" }, { authorId: "user-2" }];
      const batched = await service.evaluateMany(auth, "requirement", "approve", attributes);
      const single = await Promise.all(
        attributes.map((item) => service.evaluate(auth, "requirement", "approve", item)),
      );
      expect(batched).toEqual(single);
    });
  });

  describe("hasActivePolicies", () => {
    it("reports whether any policy applies to the caller", async () => {
      await expect(
        new PolicyService(stubDb([], auth)).hasActivePolicies(auth, "requirement", "approve"),
      ).resolves.toBe(false);
      await expect(
        new PolicyService(stubDb([policy()], auth)).hasActivePolicies(auth, "requirement", "approve"),
      ).resolves.toBe(true);
      await expect(
        new PolicyService(stubDb([policy({ role: "CONTRIBUTOR" })], auth)).hasActivePolicies(
          auth,
          "requirement",
          "approve",
        ),
      ).resolves.toBe(false);
    });
  });
});
