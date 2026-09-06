import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

export class TenderNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "TENDER_NOT_FOUND", message: "Tender not found." });
  }
}

export class TenderNotEditableError extends ConflictException {
  constructor() {
    super({
      code: "TENDER_NOT_EDITABLE",
      message: "Tender is not editable in its current state.",
    });
  }
}

export class TenderTransitionNotAllowedError extends ConflictException {
  constructor(fromStatus: string, toStatus: string) {
    super({
      code: "INVALID_TENDER_TRANSITION",
      message: `Cannot transition tender from ${fromStatus} to ${toStatus}.`,
      fromStatus,
      toStatus,
    });
  }
}

export class TenderPermissionError extends ForbiddenException {
  constructor(permission: string) {
    super({
      code: "TENDER_PERMISSION_DENIED",
      message: `Missing required permission: ${permission}`,
      permission,
    });
  }
}

export class TenderWorkspaceNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "TENDER_WORKSPACE_NOT_FOUND",
      message: "Workspace not found in this organization.",
    });
  }
}

export class TenderOwnerNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "TENDER_OWNER_NOT_FOUND",
      message: "Owner must be an active organization member.",
    });
  }
}

export class TenderQuestionNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "TENDER_QUESTION_NOT_FOUND",
      message: "Tender question not found.",
    });
  }
}

export class TenderRequirementNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "TENDER_REQUIREMENT_NOT_FOUND",
      message: "Tender requirement not found.",
    });
  }
}

export class TenderAnswerNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "TENDER_ANSWER_NOT_FOUND", message: "Tender answer not found." });
  }
}

export class TenderEvidenceNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "TENDER_EVIDENCE_NOT_FOUND", message: "Tender evidence not found." });
  }
}

export class TenderReviewNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "TENDER_REVIEW_NOT_FOUND", message: "Tender review not found." });
  }
}

export class TenderSourceNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "TENDER_SOURCE_NOT_FOUND", message: "Tender source not found." });
  }
}

export class TenderDocumentNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "TENDER_DOCUMENT_NOT_FOUND", message: "Tender document not found." });
  }
}

export class TenderSourceDuplicateError extends ConflictException {
  constructor() {
    super({
      code: "TENDER_SOURCE_DUPLICATE",
      message: "An identical source has already been registered for this tender.",
    });
  }
}

export class TenderSourceUploadIncompleteError extends ConflictException {
  constructor() {
    super({
      code: "TENDER_SOURCE_UPLOAD_INCOMPLETE",
      message: "The uploaded object is missing or incomplete.",
    });
  }
}

export class TenderSourceInvalidFileError extends BadRequestException {
  constructor(message: string, extra: Record<string, unknown> = {}) {
    super({
      code: "INVALID_TENDER_SOURCE_FILE",
      message,
      ...extra,
    });
  }
}

export class TenderSourceStorageNotConfiguredError extends ServiceUnavailableException {
  constructor() {
    super({
      code: "TENDER_SOURCE_STORAGE_NOT_CONFIGURED",
      message: "Tender source storage is not configured on this environment.",
    });
  }
}

export class TenderAiUnavailableError extends ServiceUnavailableException {
  constructor(configurationMissing = false) {
    super({
      code: configurationMissing ? "TENDER_AI_NOT_CONFIGURED" : "TENDER_AI_UNAVAILABLE",
      message: configurationMissing
        ? "Tender analysis is not configured for this environment."
        : "Tender analysis is temporarily unavailable. Please retry shortly.",
    });
  }
}

export class TenderAnswerFinalizationNotAllowedError extends ConflictException {
  constructor() {
    super({
      code: "TENDER_ANSWER_FINALIZATION_NOT_ALLOWED",
      message: "An answer can only become FINAL after review approval.",
    });
  }
}
