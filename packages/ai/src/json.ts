import type { z } from "zod";

/**
 * Models asked for JSON still sometimes wrap it in a ```json fence or add a
 * sentence around it. Tries the raw text, then a fenced block, then the
 * outermost {...} span, and returns undefined when none of them parse.
 */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const attempts = [trimmed, trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(trimmed.slice(start, end + 1));
  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

/** extractJson + schema validation; the error message names what failed. */
export function parseJsonResponse<T extends z.ZodTypeAny>(schema: T, content: string): z.infer<T> {
  const value = extractJson(content);
  if (value === undefined) throw new Error("Model response was not valid JSON.");
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Model response did not match the expected shape: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return result.data;
}
