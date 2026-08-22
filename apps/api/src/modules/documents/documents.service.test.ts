import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  customers,
  documentVersions,
  files,
  getDb,
  organizationMembers,
  organizations,
  rfpDocuments,
  rfpStatusHistory,
  rfps,
  users,
} from "@rfp-os/db";
import { ObjectStorage, type ObjectHead } from "@rfp-os/storage";
import { permissionsForRole, type AuthContext, type OrgRole } from "@rfp-os/types";

import { PolicyService } from "../../common/auth";
import { AuditService } from "../../infrastructure/audit";
import { EventPublisher } from "../../infrastructure/events";
import type { DomainEvent } from "../../infrastructure/events";
import { expectRejection } from "../rfp/test-support";
import { DocumentsRepository } from "./documents.repository";
import { DocumentsService } from "./documents.service";

/**
 * Integration coverage for document ingestion against a real database, for the
 * same reason the RFP suite is: tenant isolation and transactional
 * registration are properties of the SQL, not of the types.
 *
 * Object storage is faked rather than run, because what these tests are about
 * is what the API records and refuses — not whether the AWS SDK can sign a
 * URL. The one behaviour that genuinely depends on storage (size verification
 * at completion) is exercised through the fake's controllable head response.
 */
const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

class RecordingPublisher extends EventPublisher {
  readonly published: DomainEvent[] = [];
  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }
}

/** A stand-in for object storage whose head response each test controls. */
class FakeObjectStorage {
  readonly bucket = "test-bucket";
  /** objectKey → what headObject should report; absent means "not uploaded". */
  readonly objects = new Map<string, ObjectHead>();
  readonly presignedPuts: string[] = [];
  readonly presignedGets: string[] = [];

  async presignPut(input: { objectKey: string }): Promise<string> {
    this.presignedPuts.push(input.objectKey);
    return `https://storage.invalid/${input.objectKey}?signature=put`;
  }

  async presignGet(input: { objectKey: string }): Promise<string> {
    this.presignedGets.push(input.objectKey);
    return `https://storage.invalid/${input.objectKey}?signature=get`;
  }

  async headObject(objectKey: string): Promise<ObjectHead | null> {
    return this.objects.get(objectKey) ?? null;
  }

  /** Simulates the client's PUT actually landing. */
  put(objectKey: string, sizeBytes: number, mimeType = "application/pdf"): void {
    this.objects.set(objectKey, { sizeBytes, mimeType, etag: `"${randomUUID()}"` });
  }

  async deleteObject(): Promise<void> {}
  async bucketReachable(): Promise<boolean> {
    return true;
  }
}

const PDF = "application/pdf";

describeDb("Document ingestion", () => {
  const db = getDb();
  const events = new RecordingPublisher();
  const repository = new DocumentsRepository(db);
  const storage = new FakeObjectStorage();
  const audit = new AuditService(db);
  const policy = new PolicyService(db);

  const env: Record<string, unknown> = {
    STORAGE_ENDPOINT: "http://localhost:59000",
    UPLOAD_MAX_BYTES: 10_485_760,
    UPLOAD_URL_TTL_SECONDS: 900,
    DOWNLOAD_URL_TTL_SECONDS: 300,
  };
  const config = { get: (key: string) => env[key] } as never;

  const service = new DocumentsService(
    repository,
    storage as unknown as ObjectStorage,
    audit,
    events,
    policy,
    config,
  );

  const suffix = randomUUID().slice(0, 8);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const ownerA = randomUUID();
  const userB = randomUUID();
  const clientA = randomUUID();
  const clientB = randomUUID();
  const rfpA = randomUUID();
  const rfpB = randomUUID();

  function authFor(userId: string, organizationId: string, role: OrgRole): AuthContext {
    return {
      userId,
      organizationId,
      role,
      permissions: permissionsForRole(role),
      sessionId: `session-${userId}`,
    };
  }

  const ownerAuth = () => authFor(ownerA, orgA, "OWNER");
  const orgBAuth = () => authFor(userB, orgB, "OWNER");

  /** Runs a full intent → PUT → complete cycle and returns the document. */
  async function uploadDocument(filename = "Questionnaire.pdf", sizeBytes = 2_048) {
    const intent = await service.createUploadIntent(ownerAuth(), rfpA, {
      filename,
      mimeType: PDF,
      sizeBytes,
    });
    storage.put(intent.objectKey, sizeBytes);
    const completed = await service.completeUpload(ownerAuth(), rfpA, intent.documentId);
    return { intent, completed };
  }

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Doc Org A ${suffix}`, domain: `doc-a-${suffix}.invalid` },
      { id: orgB, name: `Doc Org B ${suffix}`, domain: `doc-b-${suffix}.invalid` },
    ]);
    await db.insert(users).values([
      { id: ownerA, organizationId: orgA, name: "Owner A", email: `doc-own-${suffix}@probe.invalid` },
      { id: userB, organizationId: orgB, name: "User B", email: `doc-usr-${suffix}@probe.invalid` },
    ]);
    await db.insert(organizationMembers).values([
      { organizationId: orgA, userId: ownerA, role: "OWNER", status: "active" },
      { organizationId: orgB, userId: userB, role: "OWNER", status: "active" },
    ]);
    await db.insert(customers).values([
      { id: clientA, organizationId: orgA, name: `Doc Client A ${suffix}` },
      { id: clientB, organizationId: orgB, name: `Doc Client B ${suffix}` },
    ]);
    await db.insert(rfps).values([
      {
        id: rfpA,
        organizationId: orgA,
        customerId: clientA,
        title: `Doc RFP A ${suffix}`,
        ownerId: ownerA,
        deadline: "2026-12-31",
      },
      {
        id: rfpB,
        organizationId: orgB,
        customerId: clientB,
        title: `Doc RFP B ${suffix}`,
        ownerId: userB,
        deadline: "2026-12-31",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(documentVersions).where(inArray(documentVersions.organizationId, [orgA, orgB]));
    await db.delete(rfpDocuments).where(inArray(rfpDocuments.organizationId, [orgA, orgB]));
    await db.delete(files).where(inArray(files.organizationId, [orgA, orgB]));
    await db.delete(rfpStatusHistory).where(inArray(rfpStatusHistory.rfpId, [rfpA, rfpB]));
    await db.delete(rfps).where(inArray(rfps.id, [rfpA, rfpB]));
    await db.delete(auditLogs).where(inArray(auditLogs.organizationId, [orgA, orgB]));
    await db.delete(customers).where(inArray(customers.organizationId, [orgA, orgB]));
    await db
      .delete(organizationMembers)
      .where(inArray(organizationMembers.organizationId, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, [ownerA, userB]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  // --- intent --------------------------------------------------------------

  describe("createUploadIntent", () => {
    dbTest("registers the file and document, and returns a presigned PUT", async () => {
      const intent = await service.createUploadIntent(ownerAuth(), rfpA, {
        filename: "Questionnaire.pdf",
        mimeType: PDF,
        sizeBytes: 4_096,
      });

      expect(intent.uploadUrl).toContain("signature=put");
      expect(intent.document.status).toBe("uploaded");
      expect(intent.document.type).toBe("PDF");
      expect(intent.document.currentVersion).toBe(1);

      const [file] = await db.select().from(files).where(eq(files.id, intent.fileId as string));
      expect(file?.bucket).toBe("test-bucket");
      expect(file?.sizeBytes).toBe(4_096);
      expect(file?.organizationId).toBe(orgA);
    });

    dbTest("writes the object key with the tenant prefix first", async () => {
      const intent = await service.createUploadIntent(ownerAuth(), rfpA, {
        filename: "Pricing.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 1_024,
      });
      expect(intent.objectKey).toBe(
        `org/${orgA}/rfp/${rfpA}/${intent.fileId}/Pricing.xlsx`,
      );
    });

    dbTest("records the document's own organization_id, not just the RFP's", async () => {
      const intent = await service.createUploadIntent(ownerAuth(), rfpA, {
        filename: "Scoped.pdf",
        mimeType: PDF,
        sizeBytes: 512,
      });
      const [row] = await db
        .select()
        .from(rfpDocuments)
        .where(eq(rfpDocuments.id, intent.documentId));
      expect(row?.organizationId).toBe(orgA);
    });

    dbTest("opens a version 1 row so history exists from the first upload", async () => {
      const intent = await service.createUploadIntent(ownerAuth(), rfpA, {
        filename: "Versioned.pdf",
        mimeType: PDF,
        sizeBytes: 512,
      });
      const versions = await repository.listVersions(orgA, intent.documentId);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.version).toBe(1);
      expect(versions[0]?.fileId).toBe(intent.fileId as string);
    });

    dbTest("refuses an unsupported type before any row is written", async () => {
      const before = await db.select().from(files).where(eq(files.organizationId, orgA));
      await expectRejection(
        service.createUploadIntent(ownerAuth(), rfpA, {
          filename: "payload.exe",
          mimeType: "application/x-msdownload",
          sizeBytes: 128,
        }),
        { code: "UNSUPPORTED_DOCUMENT_TYPE", status: 400 },
      );
      const after = await db.select().from(files).where(eq(files.organizationId, orgA));
      expect(after.length).toBe(before.length);
    });

    dbTest("refuses a file over the size limit", async () => {
      await expectRejection(
        service.createUploadIntent(ownerAuth(), rfpA, {
          filename: "huge.pdf",
          mimeType: PDF,
          sizeBytes: 20_971_520,
        }),
        { code: "DOCUMENT_TOO_LARGE", status: 400 },
      );
    });

    /**
     * The single most important test here: another tenant's RFP must be
     * indistinguishable from one that does not exist.
     */
    dbTest("reports another organization's RFP as not found", async () => {
      await expectRejection(
        service.createUploadIntent(orgBAuth(), rfpA, {
          filename: "probe.pdf",
          mimeType: PDF,
          sizeBytes: 128,
        }),
        { code: "RFP_NOT_FOUND", status: 404 },
      );
    });

    dbTest("fails loudly when storage is not configured", async () => {
      const endpoint = env.STORAGE_ENDPOINT;
      env.STORAGE_ENDPOINT = undefined;
      try {
        await expectRejection(
          service.createUploadIntent(ownerAuth(), rfpA, {
            filename: "probe.pdf",
            mimeType: PDF,
            sizeBytes: 128,
          }),
          { code: "STORAGE_NOT_CONFIGURED", status: 503 },
        );
      } finally {
        env.STORAGE_ENDPOINT = endpoint;
      }
    });
  });

  // --- completion ----------------------------------------------------------

  describe("completeUpload", () => {
    dbTest("queues the document and publishes DOCUMENT_UPLOADED", async () => {
      const before = events.published.length;
      const { completed } = await uploadDocument("Complete.pdf", 3_072);

      expect(completed.status).toBe("queued");
      const published = events.published.slice(before);
      expect(published.map((e) => e.name)).toContain("DOCUMENT_UPLOADED");
    });

    /**
     * Without this check a client could register a document, never upload,
     * and leave the pipeline to fail on a missing object far from the cause.
     */
    dbTest("refuses to complete when nothing was actually uploaded", async () => {
      const intent = await service.createUploadIntent(ownerAuth(), rfpA, {
        filename: "Never-sent.pdf",
        mimeType: PDF,
        sizeBytes: 2_048,
      });
      await expectRejection(
        service.completeUpload(ownerAuth(), rfpA, intent.documentId),
        { code: "DOCUMENT_UPLOAD_INCOMPLETE", status: 409 },
      );
    });

    /**
     * The declared size is what passed the limit check at intent, so a larger
     * object must be rejected — otherwise the limit is bypassable in one request.
     */
    dbTest("refuses an object whose size contradicts the declaration", async () => {
      const intent = await service.createUploadIntent(ownerAuth(), rfpA, {
        filename: "Mismatch.pdf",
        mimeType: PDF,
        sizeBytes: 2_048,
      });
      storage.put(intent.objectKey, 9_999_999);
      await expectRejection(
        service.completeUpload(ownerAuth(), rfpA, intent.documentId),
        { code: "DOCUMENT_SIZE_MISMATCH", status: 400 },
      );
    });

    dbTest("does not publish DOCUMENT_UPLOADED at intent time", async () => {
      const before = events.published.length;
      await service.createUploadIntent(ownerAuth(), rfpA, {
        filename: "Intent-only.pdf",
        mimeType: PDF,
        sizeBytes: 1_024,
      });
      const published = events.published.slice(before);
      expect(published.map((e) => e.name)).not.toContain("DOCUMENT_UPLOADED");
    });

    dbTest("writes both audit rows across the two phases", async () => {
      const { intent } = await uploadDocument("Audited.pdf", 1_500);
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, intent.documentId));
      const actions = logs.map((l) => l.action);
      expect(actions).toContain("DOCUMENT_UPLOAD_STARTED");
      expect(actions).toContain("DOCUMENT_UPLOADED");
    });
  });

  // --- reads ---------------------------------------------------------------

  describe("read and download", () => {
    dbTest("lists a tenant's documents and hides another tenant's", async () => {
      await uploadDocument("Listed.pdf", 900);
      const listed = await service.list(ownerAuth(), rfpA, { page: 1, pageSize: 50 });
      expect(listed.items.length).toBeGreaterThan(0);
      expect(listed.items.every((d) => d.organizationId === orgA)).toBe(true);

      await expectRejection(service.list(orgBAuth(), rfpA, { page: 1, pageSize: 50 }), {
        code: "RFP_NOT_FOUND",
        status: 404,
      });
    });

    dbTest("audits every download, because the URL is the grant", async () => {
      const { intent } = await uploadDocument("Downloaded.pdf", 700);
      const { url } = await service.createDownloadUrl(ownerAuth(), rfpA, intent.documentId);
      expect(url).toContain("signature=get");

      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, intent.documentId));
      expect(logs.map((l) => l.action)).toContain("DOCUMENT_DOWNLOADED");
    });

    /**
     * The rfpId in the route must actually constrain the lookup, or it is
     * decorative and any document is reachable through any visible RFP.
     */
    dbTest("refuses a document reached through the wrong RFP", async () => {
      const { intent } = await uploadDocument("Wrong-parent.pdf", 600);
      await expectRejection(service.getById(ownerAuth(), rfpB, intent.documentId), {
        code: "DOCUMENT_NOT_FOUND",
        status: 404,
      });
    });

    dbTest("reports another organization's document as not found", async () => {
      const { intent } = await uploadDocument("Cross-tenant.pdf", 600);
      await expectRejection(service.getById(orgBAuth(), rfpA, intent.documentId), {
        code: "DOCUMENT_NOT_FOUND",
        status: 404,
      });
    });
  });

  // --- versions and archive ------------------------------------------------

  describe("versions", () => {
    dbTest("adds a version without disturbing the previous one", async () => {
      const { intent } = await uploadDocument("Revised.pdf", 1_000);

      const next = await service.createVersionIntent(ownerAuth(), rfpA, intent.documentId, {
        filename: "Revised-v2.pdf",
        mimeType: PDF,
        sizeBytes: 1_200,
        note: "Corrected pricing table.",
      });
      expect(next.version).toBe(2);

      const versions = await repository.listVersions(orgA, intent.documentId);
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
      /* Version 1 still points at the bytes an earlier answer may have cited. */
      expect(versions[0]?.fileId).toBe(intent.fileId as string);
      expect(versions[1]?.fileId).toBe(next.fileId);

      const [document] = await db
        .select()
        .from(rfpDocuments)
        .where(eq(rfpDocuments.id, intent.documentId));
      expect(document?.currentVersion).toBe(2);
      expect(document?.status).toBe("uploaded");
    });
  });

  describe("archive", () => {
    dbTest("archives without removing the file row evidence would cite", async () => {
      const { intent } = await uploadDocument("Archived.pdf", 800);
      const archived = await service.archive(ownerAuth(), rfpA, intent.documentId);

      expect(archived.status).toBe("archived");
      expect(archived.archivedAt).not.toBeNull();

      const [file] = await db.select().from(files).where(eq(files.id, intent.fileId as string));
      expect(file).toBeDefined();
    });

    dbTest("hides archived documents from the default listing", async () => {
      const { intent } = await uploadDocument("Hidden.pdf", 800);
      await service.archive(ownerAuth(), rfpA, intent.documentId);

      const listed = await service.list(ownerAuth(), rfpA, { page: 1, pageSize: 100 });
      expect(listed.items.map((d) => d.id)).not.toContain(intent.documentId);

      const withArchived = await service.list(ownerAuth(), rfpA, {
        page: 1,
        pageSize: 100,
        includeArchived: true,
      });
      expect(withArchived.items.map((d) => d.id)).toContain(intent.documentId);
    });

    dbTest("refuses to archive twice", async () => {
      const { intent } = await uploadDocument("Twice.pdf", 800);
      await service.archive(ownerAuth(), rfpA, intent.documentId);
      await expectRejection(service.archive(ownerAuth(), rfpA, intent.documentId), {
        code: "DOCUMENT_ALREADY_ARCHIVED",
        status: 409,
      });
    });

    dbTest("refuses to add a version to an archived document", async () => {
      const { intent } = await uploadDocument("Frozen.pdf", 800);
      await service.archive(ownerAuth(), rfpA, intent.documentId);
      await expectRejection(
        service.createVersionIntent(ownerAuth(), rfpA, intent.documentId, {
          filename: "Frozen-v2.pdf",
          mimeType: PDF,
          sizeBytes: 900,
        }),
        { code: "DOCUMENT_ARCHIVED", status: 409 },
      );
    });
  });
});
