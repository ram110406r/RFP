import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z.object({ name: z.string().min(1) });
  const pipe = new ZodValidationPipe(schema);

  it("returns the parsed value when valid", () => {
    expect(pipe.transform({ name: "acme" })).toEqual({ name: "acme" });
  });

  it("throws BadRequestException with structured issues when invalid", () => {
    expect(() => pipe.transform({ name: "" })).toThrow(BadRequestException);
    try {
      pipe.transform({});
      throw new Error("expected transform to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        code: string;
        issues: Array<{ path: string }>;
      };
      expect(response.code).toBe("VALIDATION_ERROR");
      expect(response.issues[0]?.path).toBe("name");
    }
  });
});
