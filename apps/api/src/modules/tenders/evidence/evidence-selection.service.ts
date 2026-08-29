import { Injectable } from "@nestjs/common";
import type { EvidenceReference, EvidenceRetrievalResult } from "@rfp-os/types";

import { selectEvidenceCandidates, toEvidenceReference } from "./evidence.logic";

@Injectable()
export class EvidenceSelectionService {
  select(
    answerId: string,
    candidates: EvidenceRetrievalResult[],
    options: { limit?: number; minFinalScore?: number; includeStale?: boolean } = {},
  ): EvidenceReference[] {
    return selectEvidenceCandidates(candidates, options).map((candidate) => toEvidenceReference(answerId, candidate));
  }
}

