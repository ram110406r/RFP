import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { allowedTransitionsFrom, type RfpLifecycleStatus } from "./rfp-state-machine";

/**
 * Domain errors, each mapped to the HTTP status the existing API convention
 * uses. AllExceptionsFilter turns these into `{ error: { code, message } }`.
 *
 * One rule shapes all of them: an RFP in another organization is reported as
 * NOT FOUND, never as forbidden. Answering 403 would confirm the row exists,
 * which is itself a cross-tenant information leak — a caller could enumerate
 * another organization's RFP ids by watching the status code change.
 */

export class RfpNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "RFP_NOT_FOUND", message: "No RFP with that id." });
  }
}

export class RfpAlreadyArchivedError extends ConflictException {
  constructor() {
    super({ code: "RFP_ALREADY_ARCHIVED", message: "That RFP is already archived." });
  }
}

export class ArchivedRfpNotEditableError extends ConflictException {
  constructor() {
    super({
      code: "RFP_ARCHIVED",
      message: "That RFP is archived. Restore it before making changes.",
    });
  }
}

export class InvalidRfpTransitionError extends ConflictException {
  constructor(from: RfpLifecycleStatus, to: RfpLifecycleStatus) {
    const allowed = allowedTransitionsFrom(from).map((rule) => rule.to);
    super({
      code: "INVALID_RFP_TRANSITION",
      message:
        allowed.length > 0
          ? `An RFP in ${from} cannot move to ${to}. Allowed: ${allowed.join(", ")}.`
          : `An RFP in ${from} is final and cannot move to ${to}.`,
      from,
      to,
      allowed,
    });
  }
}

export class RfpTransitionNotAllowedError extends ForbiddenException {
  constructor(permission: string) {
    super({
      code: "RFP_TRANSITION_NOT_ALLOWED",
      message: `That lifecycle transition requires the ${permission} permission.`,
    });
  }
}

/**
 * Used when an owner or assignee id names someone outside the caller's
 * organization. Phrased as "not a member" rather than "no such user", so it
 * never reveals whether an account exists elsewhere on the platform.
 */
export class UserNotInOrganizationError extends BadRequestException {
  constructor() {
    super({
      code: "USER_NOT_IN_ORGANIZATION",
      message: "That user is not an active member of this organization.",
    });
  }
}

export class RfpOwnerNotFoundError extends BadRequestException {
  constructor() {
    super({
      code: "RFP_OWNER_NOT_FOUND",
      message: "The nominated owner is not an active member of this organization.",
    });
  }
}

export class ClientNotFoundError extends BadRequestException {
  constructor() {
    super({
      code: "RFP_CLIENT_NOT_FOUND",
      message: "No client with that id in this organization.",
    });
  }
}

export class DuplicateRfpAssignmentError extends ConflictException {
  constructor() {
    super({
      code: "DUPLICATE_RFP_ASSIGNMENT",
      message: "That person already holds that role on this RFP.",
    });
  }
}

export class RfpAssignmentNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "RFP_ASSIGNMENT_NOT_FOUND",
      message: "That person is not assigned to this RFP.",
    });
  }
}
