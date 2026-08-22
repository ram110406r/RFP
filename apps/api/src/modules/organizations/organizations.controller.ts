import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import {
  AllowWithoutOrg,
  CurrentAuth,
  CurrentUserId,
  OrgId,
  RequirePermissions,
} from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateOrganizationSchema,
  type AcceptInvitationInput,
  type CreateOrganizationInput,
  type InviteMemberInput,
  type UpdateMemberInput,
  type UpdateOrganizationInput,
} from "./organizations.dto";
import { OrganizationsService } from "./organizations.service";

/**
 * Organization and membership management.
 *
 * Every route here reads its tenant from @OrgId (the session), never from the
 * path — which is why the paths say "current" rather than taking an
 * organization id. The only endpoints that name an organization are the ones
 * that necessarily cross tenants (creating one, accepting an invitation), and
 * both derive it from something the server issued.
 */
@Controller({ path: "organizations", version: "1" })
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("current")
  @RequirePermissions("org:read")
  async current(@OrgId() organizationId: string) {
    return this.organizations.getCurrent(organizationId);
  }

  @Patch("current")
  @RequirePermissions("org:update")
  @ZodBody(updateOrganizationSchema)
  async update(@OrgId() organizationId: string, @Body() body: UpdateOrganizationInput) {
    return this.organizations.update(organizationId, body);
  }

  /**
   * Creating a first organization is necessarily done without one, so this
   * route allows a tenant-less session. It is the caller's own membership that
   * gets created, at OWNER, so there is nothing to authorize against.
   */
  @Post()
  @AllowWithoutOrg()
  @ZodBody(createOrganizationSchema)
  async create(@CurrentUserId() userId: string, @Body() body: CreateOrganizationInput) {
    return this.organizations.create(userId, body);
  }

  @Get("current/members")
  @RequirePermissions("member:read")
  async members(@OrgId() organizationId: string) {
    return { members: await this.organizations.listMembers(organizationId) };
  }

  @Patch("current/members/:userId")
  @RequirePermissions("member:update")
  @ZodBody(updateMemberSchema)
  async updateMember(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string,
    @Body() body: UpdateMemberInput,
  ) {
    return this.organizations.updateMember(auth, userId, body);
  }

  @Delete("current/members/:userId")
  @RequirePermissions("member:remove")
  async removeMember(@CurrentAuth() auth: AuthContext, @Param("userId") userId: string) {
    return this.organizations.removeMember(auth, userId);
  }

  @Get("current/invitations")
  @RequirePermissions("member:read")
  async invitations(@OrgId() organizationId: string) {
    return { invitations: await this.organizations.listInvitations(organizationId) };
  }

  @Post("current/invitations")
  @RequirePermissions("member:invite")
  @ZodBody(inviteMemberSchema)
  async invite(@CurrentAuth() auth: AuthContext, @Body() body: InviteMemberInput) {
    return this.organizations.invite(auth, body);
  }

  @Delete("current/invitations/:invitationId")
  @RequirePermissions("member:invite")
  async revokeInvitation(
    @OrgId() organizationId: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.organizations.revokeInvitation(organizationId, invitationId);
  }
}

/**
 * Invitation acceptance lives outside the organization path because the caller
 * is, by definition, not yet a member of the organization in question.
 */
@Controller({ path: "invitations", version: "1" })
export class InvitationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post("accept")
  @AllowWithoutOrg()
  @ZodBody(acceptInvitationSchema)
  async accept(@CurrentUserId() userId: string, @Body() body: AcceptInvitationInput) {
    return this.organizations.acceptInvitation(userId, body.token);
  }
}
