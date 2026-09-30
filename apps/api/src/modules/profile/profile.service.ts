import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  organizationMembers,
  organizations,
  users,
  workspaceMembers,
  workspaces,
  type Database,
} from "@rfp-os/db";

import { DATABASE } from "../../infrastructure/database";
import type { UpdateProfileInput } from "./profile.dto";

@Injectable()
export class ProfileService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getProfile(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Profile not found." });
    }

    const memberships = await this.db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        role: organizationMembers.role,
        status: organizationMembers.status,
        joinedAt: organizationMembers.joinedAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId));

    const workspaceRows = await this.db
      .select({
        id: workspaceMembers.id,
        workspaceId: workspaceMembers.workspaceId,
        workspaceName: workspaces.name,
        organizationMemberId: workspaceMembers.organizationMemberId,
        status: workspaceMembers.status,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .innerJoin(organizationMembers, eq(organizationMembers.id, workspaceMembers.organizationMemberId))
      .where(eq(organizationMembers.userId, userId));

    const workspacesByMember = new Map<string, typeof workspaceRows>();
    for (const workspace of workspaceRows) {
      const current = workspacesByMember.get(workspace.organizationMemberId) ?? [];
      current.push(workspace);
      workspacesByMember.set(workspace.organizationMemberId, current);
    }

    const activeMembership =
      memberships.find((membership) => membership.organizationId === user.organizationId && membership.status === "active") ??
      memberships.find((membership) => membership.status === "active") ??
      null;

    return {
      id: user.id,
      uid: user.id,
      email: user.email,
      displayName: user.name,
      name: user.name,
      preferredName: user.preferredName,
      accountType: user.accountType,
      jobTitle: user.jobTitle,
      department: user.department,
      timezone: user.timezone,
      phone: user.phone,
      location: user.location,
      language: user.language,
      bio: user.bio,
      skills: Array.isArray(user.skills) ? user.skills : [],
      notificationPreferences: user.notificationPreferences ?? {},
      photoURL: user.image,
      image: user.image,
      emailVerified: user.emailVerified,
      status: user.status,
      lastLoginAt: user.lastActiveAt?.toISOString() ?? null,
      organizationId: activeMembership?.organizationId ?? user.organizationId,
      organizationName: activeMembership?.organizationName ?? null,
      role: activeMembership?.role ?? null,
      memberships: memberships.map((membership) => ({
        ...membership,
        joinedAt: membership.joinedAt.toISOString(),
        workspaces: (workspacesByMember.get(membership.id) ?? []).map((workspace) => ({
          id: workspace.id,
          workspaceId: workspace.workspaceId,
          workspaceName: workspace.workspaceName,
          status: workspace.status,
        })),
      })),
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const patch: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.displayName !== undefined) patch.name = input.displayName;
    if (input.preferredName !== undefined) patch.preferredName = input.preferredName;
    if (input.jobTitle !== undefined) patch.jobTitle = input.jobTitle;
    if (input.department !== undefined) patch.department = input.department;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.location !== undefined) patch.location = input.location;
    if (input.language !== undefined) patch.language = input.language;
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.skills !== undefined) patch.skills = [...new Set(input.skills)];
    if (input.notificationPreferences !== undefined) {
      patch.notificationPreferences = input.notificationPreferences;
    }

    const [updated] = await this.db.update(users).set(patch).where(eq(users.id, userId)).returning({ id: users.id });
    if (!updated) {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Profile not found." });
    }

    return this.getProfile(userId);
  }
}
