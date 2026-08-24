import { getDb, rfpDocuments } from "@rfp-os/db";
import { and, eq } from "drizzle-orm";
import { requirementExtractionResultSchema } from "@rfp-os/validation";

import { PermanentJobError } from "./document-processor";
import { ExtractionRepository } from "./extraction.repository";
import {
  type RequirementCandidateInput,
  type RequirementCandidateSourceInput,
  type RequirementExtractionInput,
  RequirementExtractionRepository,
} from "./requirement-extraction.repository";

const EXTRACTOR = "deterministic@1" as const;

type SourceUnit =
  | {
      kind: "page";
      pageId: string;
      pageNumber: number;
      text: string;
      tableSegments: Array<{ tableId: string; tableIndex: number; text: string }>;
    }
  | {
      kind: "block";
      blockId: string;
      blockNumber: number;
      blockKind: "heading" | "paragraph" | "listItem" | "table";
      text: string;
      headingPath: string[];
      tableId?: string;
      tableIndex?: number;
      tableRows?: string[][];
    };

export class RequirementExtractionProcessor {
  constructor(
    private readonly documentExtractionsRepo = new ExtractionRepository(),
    private readonly requirementsRepo = new RequirementExtractionRepository(),
  ) {}

  async process(payload: RequirementExtractionInput): Promise<{
    processed: boolean;
    status: string;
    candidates: number;
  }> {
    const db = getDb();

    const [document] = await db
      .select()
      .from(rfpDocuments)
      .where(and(eq(rfpDocuments.organizationId, payload.organizationId), eq(rfpDocuments.id, payload.documentId)))
      .limit(1);

    if (!document) {
      throw new PermanentJobError(`Document ${payload.documentId} no longer exists in this organization.`);
    }

    if (document.archivedAt) {
      throw new PermanentJobError(`Document ${payload.documentId} was archived before requirement extraction.`);
    }

    const extraction = await this.documentExtractionsRepo.find(
      payload.organizationId,
      payload.documentId,
      payload.version,
    );
    if (!extraction || extraction.id !== payload.documentExtractionId || extraction.status !== "succeeded") {
      throw new PermanentJobError("Required document extraction is missing or not successful.");
    }

    const existing = await this.requirementsRepo.findByDocumentExtraction(
      payload.organizationId,
      payload.documentExtractionId,
    );
    if (existing?.status === "succeeded") {
      return { processed: false, status: existing.status, candidates: 0 };
    }

    await this.requirementsRepo.markProcessing(payload);

    const sourceUnits = await this.buildSourceUnits(payload.organizationId, document.type, extraction.id);
    const drafts = this.extractCandidates(sourceUnits);
    const validated = requirementExtractionResultSchema.parse({
      extractor: EXTRACTOR,
      candidates: drafts,
    });

    await this.requirementsRepo.saveSuccess(payload, EXTRACTOR, validated.candidates);

    return { processed: true, status: "succeeded", candidates: validated.candidates.length };
  }

  async recordFailure(payload: RequirementExtractionInput, reason: string): Promise<void> {
    await this.requirementsRepo.saveFailure(payload, EXTRACTOR, reason);
  }

  private async buildSourceUnits(
    organizationId: string,
    documentType: string,
    extractionId: string,
  ): Promise<SourceUnit[]> {
    const pages = await this.documentExtractionsRepo.listPages(organizationId, extractionId);
    const tables = await this.documentExtractionsRepo.listTables(organizationId, extractionId);
    const blocks = await this.documentExtractionsRepo.listBlocks(organizationId, extractionId);

    if (documentType === "DOCX" && blocks.length) {
      const units: SourceUnit[] = [];
      let tableCursor = 0;

      for (const block of blocks) {
        if (block.kind === "table") {
          const table = tables[tableCursor++];
          units.push({
            kind: "block",
            blockId: block.id,
            blockNumber: block.blockNumber,
            blockKind: block.kind,
            text: block.text,
            headingPath: block.headingPath ?? [],
            tableId: table?.id,
            tableIndex: table?.tableIndex,
            tableRows: table?.cells ?? [],
          });
          continue;
        }

        units.push({
          kind: "block",
          blockId: block.id,
          blockNumber: block.blockNumber,
          blockKind: block.kind,
          text: block.text,
          headingPath: block.headingPath ?? [],
        });
      }

      return units;
    }

    const units: SourceUnit[] = [];
    for (const page of pages) {
      units.push({
        kind: "page",
        pageId: page.id,
        pageNumber: page.pageNumber,
        text: page.text,
        tableSegments: tables
          .filter((table) => table.pageNumber === page.pageNumber)
          .map((table) => ({
            tableId: table.id,
            tableIndex: table.tableIndex,
            text: serializeTable(table.cells),
          })),
      });
    }

    return units;
  }

  private extractCandidates(sourceUnits: SourceUnit[]): RequirementCandidateInput[] {
    const candidates: RequirementCandidateInput[] = [];
    let candidateIndex = 0;

    for (const unit of sourceUnits) {
      if (unit.kind === "page") {
        for (const sentence of splitSegments(unit.text)) {
          const draft = this.classifyText(sentence);
          if (!draft) continue;
          candidates.push(this.toCandidate(candidateIndex++, draft, unit, sentence));
        }

        for (const table of unit.tableSegments) {
          for (const [rowIndex, row] of splitTableRows(table.text).entries()) {
            const draft = this.classifyText(row);
            if (!draft) continue;
            candidates.push(
              this.toCandidate(candidateIndex++, draft, unit, row, {
                kind: "page-table",
                tableId: table.tableId,
                tableIndex: table.tableIndex,
                rowIndex,
              }),
            );
          }
        }
        continue;
      }

      if (unit.blockKind === "table" && unit.tableRows?.length) {
        for (const [rowIndex, row] of unit.tableRows.entries()) {
          const rowText = row.join(" ").trim();
          const draft = this.classifyText(rowText);
          if (!draft) continue;
          candidates.push(
            this.toCandidate(candidateIndex++, draft, unit, rowText, {
              kind: "block-table",
              tableId: unit.tableId,
              tableIndex: unit.tableIndex,
              rowIndex,
            }),
          );
        }
        continue;
      }

      for (const sentence of splitSegments(unit.text)) {
        const draft = this.classifyText(sentence);
        if (!draft) continue;
        candidates.push(this.toCandidate(candidateIndex++, draft, unit, sentence));
      }
    }

    return candidates;
  }

  private classifyText(text: string):
    | {
        candidateType: RequirementCandidateInput["candidateType"];
        mandatory: boolean;
        confidence: number;
      }
    | null {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return null;

    const lower = normalized.toLowerCase();
    const informational = /^(background|overview|introduction|notes?|purpose)\b/i.test(normalized);
    if (informational && !hasStrongObligation(lower)) return null;

    if (isQuestion(lower, normalized)) {
      return { candidateType: "question", mandatory: false, confidence: 0.78 };
    }

    if (hasDeadline(lower)) {
      return { candidateType: "deadline", mandatory: true, confidence: 0.9 };
    }

    if (hasAcceptanceCriteria(lower)) {
      return { candidateType: "acceptance_criteria", mandatory: true, confidence: 0.88 };
    }

    if (hasConstraint(lower)) {
      return { candidateType: "constraint", mandatory: true, confidence: 0.86 };
    }

    if (hasQualification(lower)) {
      return { candidateType: "qualification", mandatory: true, confidence: 0.76 };
    }

    if (hasEvaluationCriterion(lower)) {
      return { candidateType: "evaluation_criterion", mandatory: false, confidence: 0.7 };
    }

    if (hasStrongObligation(lower)) {
      return { candidateType: "explicit_requirement", mandatory: true, confidence: 0.95 };
    }

    if (hasDeliverable(lower)) {
      return {
        candidateType: "deliverable",
        mandatory: false,
        confidence: 0.74,
      };
    }

    return null;
  }

  private toCandidate(
    candidateIndex: number,
    draft: { candidateType: RequirementCandidateInput["candidateType"]; mandatory: boolean; confidence: number },
    unit: SourceUnit,
    text: string,
    tableContext?: {
      kind: "page-table" | "block-table";
      tableId?: string;
      tableIndex?: number;
      rowIndex?: number;
    },
  ): RequirementCandidateInput {
    const normalizedText = normalizeWhitespace(text);
    const originalText = text.trim();
    const category = inferCategory(normalizedText);
    const sources = this.buildSources(unit, normalizedText, tableContext);

    return {
      candidateIndex,
      candidateType: draft.candidateType,
      category,
      mandatory: draft.mandatory,
      title: makeTitle(normalizedText),
      originalText,
      normalizedText,
      confidence: draft.confidence,
      extractionMethod: "deterministic",
      status: "extracted",
      sources,
    };
  }

  private buildSources(
    unit: SourceUnit,
    excerpt: string,
    tableContext?: {
      kind: "page-table" | "block-table";
      tableId?: string;
      tableIndex?: number;
      rowIndex?: number;
    },
  ): RequirementCandidateSourceInput[] {
    if (unit.kind === "page") {
      const sources: RequirementCandidateSourceInput[] = [
        {
          sourceIndex: 0,
          sourceKind: "page",
          documentPageId: unit.pageId,
          excerpt,
        },
      ];
      if (tableContext?.tableId) {
        const tableSource: RequirementCandidateSourceInput = {
          sourceIndex: 1,
          sourceKind: "table",
          documentPageId: unit.pageId,
          documentTableId: tableContext.tableId,
          excerpt,
          columnIndex: 0,
        };
        if (tableContext.rowIndex !== undefined) {
          tableSource.rowIndex = tableContext.rowIndex;
        }
        sources.push(tableSource);
      }
      return sources;
    }

    const sources: RequirementCandidateSourceInput[] = [
      {
        sourceIndex: 0,
        sourceKind: "block",
        documentBlockId: unit.blockId,
        excerpt,
      },
    ];

    if (tableContext?.tableId) {
      const tableSource: RequirementCandidateSourceInput = {
        sourceIndex: 1,
        sourceKind: "table",
        documentBlockId: unit.blockId,
        documentTableId: tableContext.tableId,
        excerpt,
        columnIndex: 0,
      };
      if (tableContext.rowIndex !== undefined) {
        tableSource.rowIndex = tableContext.rowIndex;
      }
      sources.push(tableSource);
    }

    return sources;
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function makeTitle(text: string): string {
  const trimmed = normalizeWhitespace(text).replace(/[.?!]+$/, "");
  return trimmed.length > 96 ? `${trimmed.slice(0, 93)}...` : trimmed;
}

function splitSegments(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function splitTableRows(text: string): string[] {
  return text
    .split(/\n+/)
    .map((row) => normalizeWhitespace(row))
    .filter(Boolean);
}

function serializeTable(cells: string[][]): string {
  return cells.map((row) => row.join(" \t ")).join("\n");
}

function hasStrongObligation(text: string): boolean {
  return /\b(must|shall|required to|is required to|vendor shall|supplier shall|bidder shall|mandatory)\b/.test(text);
}

function hasDeadline(text: string): boolean {
  return /\b(no later than|by\s+\w+|within\s+\d+\s+(days|business days|weeks|months)|deadline|due date|due)\b/.test(text);
}

function hasAcceptanceCriteria(text: string): boolean {
  return /\b(acceptance criteria|accepted when|must be accepted when|criteria for acceptance)\b/.test(text);
}

function hasConstraint(text: string): boolean {
  return /\b(shall not|must not|cannot|may not|no more than|at least|minimum|maximum|limited to|only)\b/.test(text);
}

function hasQualification(text: string): boolean {
  return /\b(qualified|certified|experience|demonstrate|capable of|qualification)\b/.test(text);
}

function hasEvaluationCriterion(text: string): boolean {
  return /\b(evaluation|evaluate|scored|scoring|weighted|points|criterion)\b/.test(text);
}

function hasDeliverable(text: string): boolean {
  return /\b(provide|submit|deliver|furnish)\b/.test(text);
}

function isQuestion(lower: string, original: string): boolean {
  return original.trim().endsWith("?") || /^\s*(what|how|when|where|who|why|which|describe|explain|indicate|state)\b/.test(lower);
}

function inferCategory(text: string):
  | "Security"
  | "Commercial"
  | "Compliance"
  | "Product"
  | "Legal"
  | "Architecture"
  | "Support"
  | null {
  const lower = text.toLowerCase();
  if (/\b(privacy|security|authentication|authorization|encryption|vulnerability|breach|sso|saml|oauth)\b/.test(lower)) {
    return "Security";
  }
  if (/\b(price|pricing|commercial|fee|cost|invoice|payment|financial|bid)\b/.test(lower)) {
    return "Commercial";
  }
  if (/\b(compliance|regulatory|regulation|policy|audit|sox|gdpr|hipaa)\b/.test(lower)) {
    return "Compliance";
  }
  if (/\b(legal|contract|agreement|terms|warranty|liability)\b/.test(lower)) {
    return "Legal";
  }
  if (/\b(architecture|integration|api|system|platform|infrastructure|technical)\b/.test(lower)) {
    return "Architecture";
  }
  if (/\b(support|helpdesk|sla|maintenance|service desk)\b/.test(lower)) {
    return "Support";
  }
  if (/\b(product|feature|functionality|capability|workflow)\b/.test(lower)) {
    return "Product";
  }
  return null;
}
