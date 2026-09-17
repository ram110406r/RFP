import { describe, expect, test } from "bun:test";

import { resolveSelectedWorkspaceId } from "./workspace-selection";

describe("resolveSelectedWorkspaceId", () => {
  test("keeps the selected active workspace", () => {
    expect(resolveSelectedWorkspaceId("workspace-2", [
      { id: "workspace-1", status: "active" },
      { id: "workspace-2", status: "active" },
    ])).toBe("workspace-2");
  });

  test("falls back to the first active workspace when the selected workspace is stale", () => {
    expect(resolveSelectedWorkspaceId("deleted-workspace", [
      { id: "workspace-1", status: "archived" },
      { id: "workspace-2", status: "active" },
      { id: "workspace-3", status: "active" },
    ])).toBe("workspace-2");
  });

  test("returns null when no active workspace is available", () => {
    expect(resolveSelectedWorkspaceId("workspace-1", [{ id: "workspace-1", status: "archived" }])).toBeNull();
  });
});
