import { describe, expect, test } from "bun:test";

import { roleHasPermission, type OrgRole, type Permission } from "./authz";

const administrators: OrgRole[] = ["OWNER", "ADMIN"];
const operators: OrgRole[] = ["RFP_MANAGER", "CONTRIBUTOR", "REVIEWER", "SME", "VIEWER"];
const administration: Permission[] = ["member:invite", "member:update", "member:remove", "workspace:create", "workspace:update", "workspace:archive", "workspace:member:manage", "team:create", "team:update", "team:archive", "team:member:manage"];

describe("organization administration permission contract", () => {
  for (const role of administrators) test(`${role} can administer the organization`, () => administration.forEach((permission) => expect(roleHasPermission(role, permission)).toBe(true)));
  for (const role of operators) test(`${role} cannot administer the organization`, () => administration.forEach((permission) => expect(roleHasPermission(role, permission)).toBe(false)));
});
