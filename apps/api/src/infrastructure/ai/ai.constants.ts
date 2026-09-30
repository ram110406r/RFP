export const GROUNDED_ANSWER_MODEL = "tendyy-grounded-draft-v1";
export const GROUNDED_IMPROVE_MODEL = "tendyy-grounded-improve-v1";
export const GROUNDED_ANALYSIS_MODEL = "tendyy-grounded-analysis-v1";
export const GROUNDED_TENDER_BRIEF_MODEL = "tendyy-tender-brief-v1";
export const GROUNDED_REQUIREMENT_ANALYSIS_MODEL = "tendyy-requirement-analysis-v1";
export const GROUNDED_CLARIFICATION_MODEL = "tendyy-clarification-v1";

export const TIER_2_AI_MODELS = [
  GROUNDED_ANSWER_MODEL,
  GROUNDED_IMPROVE_MODEL,
  GROUNDED_ANALYSIS_MODEL,
  GROUNDED_TENDER_BRIEF_MODEL,
  GROUNDED_REQUIREMENT_ANALYSIS_MODEL,
  GROUNDED_CLARIFICATION_MODEL,
] as const;

/** DI token for the optional knowledge embedder (see AiModule). */
export const KNOWLEDGE_EMBEDDER = Symbol("KNOWLEDGE_EMBEDDER");
