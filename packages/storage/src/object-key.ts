/**
 * Object key layout.
 *
 * The organization prefix comes first so per-tenant bucket policies and
 * lifecycle rules are expressible as key prefixes, and so listing one tenant's
 * objects can never walk into another's.
 *
 * The file id sits in the path because `files` has a unique index on
 * (bucket, object_key): with a generated id in the key, two uploads of the
 * same filename to the same RFP cannot collide structurally, rather than
 * relying on callers to pick distinct names.
 */
export interface DocumentObjectKeyInput {
  organizationId: string;
  rfpId: string;
  fileId: string;
  filename: string;
}

export function documentObjectKey(input: DocumentObjectKeyInput): string {
  const name = sanitizeFilename(input.filename);
  return `org/${input.organizationId}/rfp/${input.rfpId}/${input.fileId}/${name}`;
}

/**
 * Reduces a filename to something safe to place in a key.
 *
 * Path separators and traversal segments are the point: a filename of
 * `../../other-org/x` would otherwise escape the tenant prefix that the whole
 * layout depends on.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : "file";
}
