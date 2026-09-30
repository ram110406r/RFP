import { createHash, randomBytes } from "node:crypto";

/**
 * Invitation tokens are 256-bit random secrets. Only their SHA-256 hash is
 * stored, so the plaintext lives in the emailed link and nowhere else.
 * Migration 0036 hashes pre-existing tokens the same way (hex of UTF-8 bytes).
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}
