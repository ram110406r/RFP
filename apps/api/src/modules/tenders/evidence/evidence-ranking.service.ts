import { Injectable } from "@nestjs/common";
import type { EvidenceRetrievalResult } from "@rfp-os/types";

import { rankEvidenceCandidates } from "./evidence.logic";

@Injectable()
export class EvidenceRankingService {
  rank(candidates: EvidenceRetrievalResult[]): EvidenceRetrievalResult[] {
    return rankEvidenceCandidates(candidates);
  }
}

