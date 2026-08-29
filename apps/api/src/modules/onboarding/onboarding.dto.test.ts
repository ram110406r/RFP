import { describe, expect, test } from "bun:test";

import { companySchema } from "./onboarding.dto";

describe("companySchema", () => {
  test("normalizes a bare company domain", () => {
    const company = companySchema.parse({ name: "Acme Corporation", website: "acme.example" });

    expect(company.website).toBe("https://acme.example");
  });

  test("preserves a complete website URL", () => {
    const company = companySchema.parse({ name: "Acme Corporation", website: "https://acme.example/about" });

    expect(company.website).toBe("https://acme.example/about");
  });

  test("allows an omitted website", () => {
    const company = companySchema.parse({ name: "Acme Corporation", website: "" });

    expect(company.website).toBe("");
  });
});
