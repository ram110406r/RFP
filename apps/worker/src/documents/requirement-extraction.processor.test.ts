import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  customers,
  documentBlocks,
  documentExtractions,
  documentVersions,
  files,
  getDb,
  organizations,
  rfpRequirements,
  requirementCandidateSources,
  requirementCandidates,
  requirementExtractions,
  rfpDocuments,
  rfps,
  users,
} from "@rfp-os/db";
import { DOCUMENT_JOBS, type DocumentJobPayload } from "@rfp-os/jobs";
import type { ObjectStorage } from "@rfp-os/storage";
import { and, asc, eq, inArray } from "drizzle-orm";

import { DocumentProcessor, isPermanent } from "./document-processor";
import { RequirementExtractionProcessor } from "./requirement-extraction.processor";
import type { RequirementCandidateInput } from "./requirement-extraction.repository";
import {
  DOCX_MIME,
  buildDocx,
  docxHeading,
  docxListItem,
  docxParagraph,
  docxTable,
} from "./docx-test-fixtures";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

describeDb("Requirement extraction", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const storage = new FakeStorage();
  const documentProcessor = new DocumentProcessor(storage as unknown as ObjectStorage);
  const requirementProcessor = new RequirementExtractionProcessor();

  const suffix = randomUUID().slice(0, 8);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const rfpId = randomUUID();
  const documentIds: string[] = [];
  const fileIds: string[] = [];
  const versionIds: string[] = [];

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Req Org A ${suffix}`, domain: `ra-${suffix}.invalid` },
      { id: orgB, name: `Req Org B ${suffix}`, domain: `rb-${suffix}.invalid` },
    ]);
    await db.insert(users).values({
      id: userId,
      organizationId: orgA,
      name: "Requirement Tester",
      email: `req-${suffix}@ra-${suffix}.invalid`,
    });
    await db.insert(customers).values({
      id: customerId,
      organizationId: orgA,
      name: `Client ${suffix}`,
    });
    await db.insert(rfps).values({
      id: rfpId,
      organizationId: orgA,
      customerId,
      title: `Requirements RFP ${suffix}`,
      ownerId: userId,
      createdBy: userId,
      deadline: "2026-12-31",
    });
  });

  afterAll(async () => {
    if (documentIds.length) {
      await db.delete(rfpDocuments).where(inArray(rfpDocuments.id, documentIds));
    }
    if (versionIds.length) {
      await db.delete(documentVersions).where(inArray(documentVersions.id, versionIds));
    }
    if (fileIds.length) {
      await db.delete(files).where(inArray(files.id, fileIds));
    }
    await db.delete(rfps).where(eq(rfps.id, rfpId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  async function givenQueuedDocument(
    content: Uint8Array,
    options: { documentType?: "PDF" | "DOCX"; filename?: string; mimeType?: string } = {},
  ): Promise<DocumentJobPayload> {
    const documentType = options.documentType ?? "PDF";
    const filename = options.filename ?? (documentType === "DOCX" ? "doc.docx" : "doc.pdf");
    const mimeType = options.mimeType ?? (documentType === "DOCX" ? DOCX_MIME : "application/pdf");
    const documentId = randomUUID();
    const fileId = randomUUID();
    const versionId = randomUUID();
    const objectKey = `${orgA}/${rfpId}/${fileId}/${filename}`;
    documentIds.push(documentId);
    fileIds.push(fileId);
    versionIds.push(versionId);

    await db.insert(files).values({
      id: fileId,
      organizationId: orgA,
      bucket: "test-bucket",
      objectKey,
      filename,
      mimeType,
      sizeBytes: content.length,
      uploadedBy: userId,
    });
    await db.insert(rfpDocuments).values({
      id: documentId,
      organizationId: orgA,
      rfpId,
      fileId,
      filename,
      type: documentType,
      status: "queued",
      currentVersion: 1,
      storageKey: objectKey,
      uploadedBy: userId,
    });
    await db.insert(documentVersions).values({
      id: versionId,
      organizationId: orgA,
      documentId,
      fileId,
      version: 1,
      note: "Initial version.",
      createdBy: userId,
    });
    storage.put(objectKey, content);

    return {
      organizationId: orgA,
      rfpId,
      documentId,
      fileId,
      version: 1,
      objectKey,
      mimeType,
      actorId: userId,
    };
  }

  async function addVersion(
    documentId: string,
    version: number,
    content: Uint8Array,
    options: { documentType?: "PDF" | "DOCX"; filename?: string; mimeType?: string } = {},
  ): Promise<DocumentJobPayload> {
    const documentType = options.documentType ?? "PDF";
    const filename = options.filename ?? `doc-v${version}.${documentType === "DOCX" ? "docx" : "pdf"}`;
    const mimeType = options.mimeType ?? (documentType === "DOCX" ? DOCX_MIME : "application/pdf");
    const fileId = randomUUID();
    const versionId = randomUUID();
    const objectKey = `${orgA}/${rfpId}/${fileId}/${filename}`;
    fileIds.push(fileId);
    versionIds.push(versionId);

    await db.insert(files).values({
      id: fileId,
      organizationId: orgA,
      bucket: "test-bucket",
      objectKey,
      filename,
      mimeType,
      sizeBytes: content.length,
      uploadedBy: userId,
    });
    await db.insert(documentVersions).values({
      id: versionId,
      organizationId: orgA,
      documentId,
      fileId,
      version,
      note: `Version ${version}.`,
      createdBy: userId,
    });
    storage.put(objectKey, content);

    return {
      organizationId: orgA,
      rfpId,
      documentId,
      fileId,
      version,
      objectKey,
      mimeType,
      actorId: userId,
    };
  }

  async function promoteToCurrentVersion(
    documentId: string,
    payload: DocumentJobPayload,
    filename = "doc-v2.pdf",
  ): Promise<void> {
    await db
      .update(rfpDocuments)
      .set({
        fileId: payload.fileId,
        filename,
        status: "queued",
        currentVersion: payload.version,
        pageCount: null,
        failureReason: null,
        storageKey: payload.objectKey,
        updatedAt: new Date(),
      })
      .where(eq(rfpDocuments.id, documentId));
  }

  async function runRequirementExtraction(payload: DocumentJobPayload) {
    await documentProcessor.process(DOCUMENT_JOBS.PARSE, payload);
    const [documentExtraction] = await db
      .select()
      .from(documentExtractions)
      .where(
        and(
          eq(documentExtractions.organizationId, payload.organizationId),
          eq(documentExtractions.documentId, payload.documentId),
          eq(documentExtractions.version, payload.version),
        ),
      )
      .limit(1);

    expect(documentExtraction).toBeDefined();
    await requirementProcessor.process({
      organizationId: payload.organizationId,
      rfpId: payload.rfpId,
      documentId: payload.documentId,
      version: payload.version,
      documentExtractionId: documentExtraction!.id,
    });
    const [run] = await db
      .select()
      .from(requirementExtractions)
      .where(eq(requirementExtractions.documentExtractionId, documentExtraction!.id))
      .limit(1);
    expect(run).toBeDefined();
    return { documentExtraction: documentExtraction!, run: run! };
  }

  dbTest("extracts conservative PDF candidates with page provenance", async () => {
    const payload = await givenQueuedDocument(
      buildPdf([
        "Vendor shall provide SSO support. What is your rollout approach?",
      ]),
    );

    const { run, documentExtraction } = await runRequirementExtraction(payload);
    const candidates = await db
      .select()
      .from(requirementCandidates)
      .where(eq(requirementCandidates.extractionId, run.id))
      .orderBy(asc(requirementCandidates.candidateIndex));

    expect(candidates.map((c) => c.candidateType)).toEqual(
      expect.arrayContaining(["explicit_requirement", "question"]),
    );
    expect(candidates.some((c) => c.candidateType === "explicit_requirement")).toBe(true);
    expect(candidates.some((c) => c.candidateType === "question")).toBe(true);

    const sources = await db
      .select()
      .from(requirementCandidateSources)
      .where(inArray(requirementCandidateSources.candidateId, candidates.map((c) => c.id)));
    expect(sources.every((source) => source.documentPageId !== null)).toBe(true);
    expect(sources.some((source) => source.documentTableId !== null)).toBe(false);
    expect(documentExtraction.status).toBe("succeeded");
  });

  dbTest("classifies supported deterministic patterns without overfitting weak wording", async () => {
    const cases: Array<{
      text: string;
      expectedType: RequirementCandidateInput["candidateType"] | null;
      description: string;
    }> = [
      {
        text: "Vendor shall provide SSO support.",
        expectedType: "explicit_requirement",
        description: "shall requirement",
      },
      {
        text: "The system must not be confused with the existing platform.",
        expectedType: "constraint",
        description: "constraint",
      },
      {
        text: "Acceptance criteria: the solution is accepted when all checks pass.",
        expectedType: "acceptance_criteria",
        description: "acceptance criterion",
      },
      {
        text: "Are you able to support SSO?",
        expectedType: "question",
        description: "question",
      },
      {
        text: "Provide the implementation schedule.",
        expectedType: "deliverable",
        description: "deliverable",
      },
      {
        text: "Submit the implementation schedule by March 31, 2027.",
        expectedType: "deadline",
        description: "deadline",
      },
      {
        text: "The vendor should demonstrate certified experience.",
        expectedType: "qualification",
        description: "qualification",
      },
      {
        text: "Evaluation criteria are scored on price.",
        expectedType: "evaluation_criterion",
        description: "evaluation criterion",
      },
      {
        text: "Background: this section is only context and not a requirement.",
        expectedType: null,
        description: "background negative",
      },
      {
        text: "The system should be reliable and easy to use.",
        expectedType: null,
        description: "weak keyword negative",
      },
    ];

    for (const testCase of cases) {
      const payload = await givenQueuedDocument(buildPdf([testCase.text]));
      const { run } = await runRequirementExtraction(payload);
      const candidates = await db
        .select()
        .from(requirementCandidates)
        .where(eq(requirementCandidates.extractionId, run.id));

      if (testCase.expectedType === null) {
        expect(candidates).toHaveLength(0);
        continue;
      }

      expect(candidates.some((candidate) => candidate.candidateType === testCase.expectedType)).toBe(true);
    }
  });

  dbTest("persists DOCX logical block provenance and table row provenance", async () => {
    const payload = await givenQueuedDocument(
      buildDocx([
        docxHeading(1, "Security Requirements"),
        docxParagraph("The vendor shall provide SSO support."),
        docxListItem("Provide evidence of SOC 2 compliance."),
        docxTable([
          ["Item", "Due"],
          ["Implementation schedule", "No later than 30 days after award"],
        ]),
      ]),
      { documentType: "DOCX", mimeType: DOCX_MIME, filename: "doc.docx" },
    );

    const { run } = await runRequirementExtraction(payload);
    const blocks = await db
      .select()
      .from(documentBlocks)
      .where(eq(documentBlocks.documentId, payload.documentId))
      .orderBy(asc(documentBlocks.blockNumber));
    const candidates = await db
      .select()
      .from(requirementCandidates)
      .where(eq(requirementCandidates.extractionId, run.id))
      .orderBy(asc(requirementCandidates.candidateIndex));
    const sources = await db
      .select()
      .from(requirementCandidateSources)
      .where(inArray(requirementCandidateSources.candidateId, candidates.map((c) => c.id)));

    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "listItem", "table"]);
    expect(sources.some((source) => source.documentBlockId !== null)).toBe(true);
    expect(sources.some((source) => source.documentTableId !== null)).toBe(true);
    expect(sources.some((source) => source.rowIndex !== null)).toBe(true);
  });

  dbTest("is idempotent for duplicate requirement extraction runs", async () => {
    const payload = await givenQueuedDocument(
      buildPdf(["Vendor shall provide SSO support. Submit the implementation schedule."]),
    );
    const first = await runRequirementExtraction(payload);
    const second = await requirementProcessor.process({
      organizationId: payload.organizationId,
      rfpId: payload.rfpId,
      documentId: payload.documentId,
      version: payload.version,
      documentExtractionId: first.documentExtraction.id,
    });

    const candidates = await db
      .select()
      .from(requirementCandidates)
      .where(eq(requirementCandidates.extractionId, first.run.id));
    expect(second).toEqual({ processed: false, status: "succeeded", candidates: 0 });
    expect(candidates).toHaveLength(2);
  });

  dbTest("keeps version histories separate and records terminal failures", async () => {
    const v1 = await givenQueuedDocument(buildPdf(["Version 1 vendor shall provide SSO support."]));
    const v1Run = await runRequirementExtraction(v1);
    const v2 = await addVersion(v1.documentId, 2, buildPdf(["Version 2 vendor shall provide SSO support."]));
    await promoteToCurrentVersion(v1.documentId, v2);
    const v2Run = await runRequirementExtraction(v2);

    expect(v1Run.run.id).not.toBe(v2Run.run.id);

    await requirementProcessor.recordFailure(
      {
        organizationId: v1.organizationId,
        rfpId: v1.rfpId,
        documentId: v1.documentId,
        version: v1.version,
        documentExtractionId: v1Run.documentExtraction.id,
      },
      "simulated failure",
    );

    const [failedRun] = await db
      .select()
      .from(requirementExtractions)
      .where(eq(requirementExtractions.documentExtractionId, v1Run.documentExtraction.id))
      .limit(1);

    expect(failedRun?.status).toBe("failed");
    expect(failedRun?.failureReason).toBe("simulated failure");
  });

  dbTest("keeps stale version extraction historical after a newer version becomes current", async () => {
    const v1 = await givenQueuedDocument(buildPdf(["Version 1 vendor shall provide SSO support."]));
    await documentProcessor.process(DOCUMENT_JOBS.PARSE, v1);
    const [v1Extraction] = await db
      .select()
      .from(documentExtractions)
      .where(
        and(
          eq(documentExtractions.organizationId, v1.organizationId),
          eq(documentExtractions.documentId, v1.documentId),
          eq(documentExtractions.version, v1.version),
        ),
      )
      .limit(1);

    expect(v1Extraction).toBeDefined();

    const v2 = await addVersion(v1.documentId, 2, buildPdf(["Version 2 vendor shall provide SSO support."]));
    await promoteToCurrentVersion(v1.documentId, v2);

    await requirementProcessor.process({
      organizationId: v1.organizationId,
      rfpId: v1.rfpId,
      documentId: v1.documentId,
      version: v1.version,
      documentExtractionId: v1Extraction!.id,
    });

    const documentRow = await db
      .select()
      .from(rfpDocuments)
      .where(eq(rfpDocuments.id, v1.documentId))
      .limit(1);

    expect(documentRow[0]?.currentVersion).toBe(2);
    expect(documentRow[0]?.fileId).toBe(v2.fileId);

    const [v1Run] = await db
      .select()
      .from(requirementExtractions)
      .where(eq(requirementExtractions.documentExtractionId, v1Extraction!.id))
      .limit(1);
    const v1Candidates = await db
      .select()
      .from(requirementCandidates)
      .where(eq(requirementCandidates.extractionId, v1Run!.id));
    expect(v1Candidates.length).toBeGreaterThan(0);
  });

  dbTest("rejects the wrong tenant", async () => {
    const payload = await givenQueuedDocument(buildPdf(["Vendor shall provide SSO support."]));
    const error = await requirementProcessor
      .process({
        organizationId: orgB,
        rfpId: payload.rfpId,
        documentId: payload.documentId,
        version: payload.version,
        documentExtractionId: randomUUID(),
      })
      .catch((caught: unknown) => caught);

    expect(isPermanent(error)).toBe(true);
  });

  dbTest("does not mutate canonical requirements", async () => {
    const payload = await givenQueuedDocument(buildPdf(["Vendor shall provide SSO support."]));
    const canonicalRequirementId = randomUUID();

    await db.insert(rfpRequirements).values({
      id: canonicalRequirementId,
      rfpId,
      code: "REQ-001",
      title: "Existing canonical requirement",
      question: "What is your SSO approach?",
      category: "Security",
      mandatory: true,
      risk: "low",
      riskRationale: "",
      ownerTeam: "Security",
      status: "unanswered",
    });

    const before = await db
      .select()
      .from(rfpRequirements)
      .where(eq(rfpRequirements.id, canonicalRequirementId))
      .limit(1);

    await runRequirementExtraction(payload);

    const after = await db
      .select()
      .from(rfpRequirements)
      .where(eq(rfpRequirements.id, canonicalRequirementId))
      .limit(1);

    expect(after).toEqual(before);
    expect(
      await db
        .select()
        .from(rfpRequirements)
        .where(eq(rfpRequirements.rfpId, rfpId)),
    ).toHaveLength(1);
  });

  dbTest("refuses to process an archived document", async () => {
    const payload = await givenQueuedDocument(buildPdf(["Vendor shall provide SSO support."]));
    await documentProcessor.process(DOCUMENT_JOBS.PARSE, payload);

    await db
      .update(rfpDocuments)
      .set({ archivedAt: new Date(), status: "archived" })
      .where(eq(rfpDocuments.id, payload.documentId));

    const [documentExtraction] = await db
      .select()
      .from(documentExtractions)
      .where(
        and(
          eq(documentExtractions.organizationId, payload.organizationId),
          eq(documentExtractions.documentId, payload.documentId),
          eq(documentExtractions.version, payload.version),
        ),
      )
      .limit(1);

    expect(documentExtraction).toBeDefined();

    const error = await requirementProcessor
      .process({
        organizationId: payload.organizationId,
        rfpId: payload.rfpId,
        documentId: payload.documentId,
        version: payload.version,
        documentExtractionId: documentExtraction!.id,
      })
      .catch((caught: unknown) => caught);

    expect(isPermanent(error)).toBe(true);
    expect(
      await db
        .select()
        .from(requirementExtractions)
        .where(eq(requirementExtractions.documentExtractionId, documentExtraction!.id)),
    ).toHaveLength(0);
  });
});

class FakeStorage {
  private readonly objects = new Map<string, Uint8Array>();

  put(objectKey: string, bytes: Uint8Array): void {
    this.objects.set(objectKey, bytes);
  }

  async headObject(objectKey: string): Promise<{ sizeBytes: number } | null> {
    const bytes = this.objects.get(objectKey);
    return bytes ? { sizeBytes: bytes.byteLength } : null;
  }

  async readObjectPrefix(objectKey: string, length: number): Promise<Uint8Array | null> {
    const bytes = this.objects.get(objectKey);
    return bytes ? bytes.subarray(0, length) : null;
  }

  async readObject(objectKey: string): Promise<Uint8Array | null> {
    return this.objects.get(objectKey) ?? null;
  }
}

function buildPdf(pageTexts: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let currentLength = encoder.encode(parts[0]).length;

  const push = (body: string, objectNumber: number) => {
    const object = `${objectNumber} 0 obj\n${body}\nendobj\n`;
    offsets[objectNumber] = currentLength;
    parts.push(object);
    currentLength += encoder.encode(object).length;
  };

  push("<< /Type /Catalog /Pages 2 0 R >>", 1);
  const pageNumbers = pageTexts.map((_, index) => 5 + index * 2);
  push(`<< /Type /Pages /Kids [${pageNumbers.map((page) => `${page} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`, 2);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", 3);

  pageTexts.forEach((text, index) => {
    const contentNumber = 4 + index * 2;
    const pageNumber = 5 + index * 2;
    const stream = `BT /F1 24 Tf 72 720 Td (${escapePdfString(text)}) Tj ET`;
    push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`, contentNumber);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`,
      pageNumber,
    );
  });

  const body = parts.join("");
  const xrefOffset = encoder.encode(body).length;
  const size = 5 + pageTexts.length * 2;
  const xrefLines = [
    "xref",
    `0 ${size}`,
    "0000000000 65535 f ",
    ...Array.from({ length: size - 1 }, (_, index) => {
      const objectNumber = index + 1;
      const offset = offsets[objectNumber] ?? 0;
      return `${String(offset).padStart(10, "0")} 00000 n `;
    }),
    "trailer",
    `<< /Size ${size} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ];

  return encoder.encode(`${body}${xrefLines.join("\n")}\n`);
}

function escapePdfString(text: string): string {
  return text.replace(/[\\()]/g, "\\$&");
}
