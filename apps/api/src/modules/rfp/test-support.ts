import type { HttpException } from "@nestjs/common";

/**
 * Asserts a call fails, and fails with the domain error it is supposed to.
 *
 * Used instead of `expect(promise).rejects.toThrow()` for two reasons. The
 * matcher form passes for *any* rejection, so a test asserting "cross-tenant
 * access is refused" would still pass if the call blew up for an unrelated
 * reason — precisely the case where a false green is dangerous. And bun's
 * `.rejects` chain hangs on these promises in this suite, which cost enough
 * debugging that it is worth naming here.
 *
 * Returns the parsed error body so callers can assert further.
 */
export async function expectRejection(
  promise: Promise<unknown>,
  expected: { code?: string; status?: number } = {},
): Promise<{ code: string; message: string; status: number }> {
  let error: unknown;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }

  if (error === undefined) {
    throw new Error(
      `Expected the call to fail${expected.code ? ` with ${expected.code}` : ""}, but it resolved.`,
    );
  }

  const exception = error as HttpException;
  if (typeof exception.getStatus !== "function") {
    throw new Error(`Expected an HttpException, received: ${String(error)}`);
  }

  const body = exception.getResponse() as { code?: string; message?: string };
  const actual = {
    code: body.code ?? "UNKNOWN",
    message: body.message ?? exception.message,
    status: exception.getStatus(),
  };

  if (expected.code && actual.code !== expected.code) {
    throw new Error(`Expected error code ${expected.code}, received ${actual.code}.`);
  }
  if (expected.status && actual.status !== expected.status) {
    throw new Error(`Expected status ${expected.status}, received ${actual.status}.`);
  }

  return actual;
}
