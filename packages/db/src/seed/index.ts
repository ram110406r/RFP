/**
 * DEVELOPMENT SEED DATA — explicitly invoked (`bun run db:seed`), never
 * imported by application code or the frontend. Populates a realistic
 * dataset for local development and demos. Production databases should
 * never run this against real customer data.
 */
import { closeDb, getDb } from "../client";
import {
  activities,
  apiKeys,
  configToggles,
  customers,
  integrations,
  knowledgeClaims,
  knowledgeConflictVariants,
  knowledgeConflicts,
  knowledgeSources,
  knowledgeVersions,
  mcpConnections,
  notificationPreferences,
  notifications,
  organizationMembers,
  organizations,
  teamMembers,
  teams,
  tenderAnswerReviews,
  tenderAnswers,
  tenderQuestions,
  tenderQuestionRequirements,
  tenderRequirements,
  tenderStatusHistory,
  tenderValidationRuns,
  tenders,
  workspaceMembers,
  workspaces,
  permissions,
  rfpAnswers,
  rfpAssignments,
  rfpCollaborators,
  rfpDocuments,
  rfpEvidence,
  rfpRequirements,
  rfpReviews,
  rfpRisks,
  rfps,
  rolePermissions,
  roles,
  users,
} from "../schema";

export async function seedDevelopmentData() {
  const db = getDb();

  try {
    console.log("Seeding development data...");

    const [org] = await db
      .insert(organizations)
      .values({
        name: "Halcyon Systems",
        domain: "halcyonsystems.com",
        plan: "Enterprise",
        seats: 40,
        industry: "Enterprise Software",
        logoInitials: "HS",
      })
      .returning();
    if (!org) throw new Error("Failed to seed organization.");
    const organizationId = org.id;

    const PERMISSION_DEFS = [
      { key: "org.manage", label: "Manage org settings" },
      { key: "members.manage", label: "Manage members & roles" },
      { key: "integrations.manage", label: "Manage integrations" },
      { key: "rfps.full_access", label: "Full RFP access" },
      { key: "rfps.create", label: "Create RFPs" },
      { key: "reviewers.assign", label: "Assign reviewers" },
      { key: "submissions.generate", label: "Generate submission packages" },
      { key: "answers.edit_all", label: "Edit all answers" },
      { key: "answers.approve", label: "Approve / reject answers" },
      { key: "reviews.request_changes", label: "Request changes" },
      { key: "requirements.comment", label: "Comment on requirements" },
      { key: "answers.edit_assigned", label: "Edit assigned answers" },
      { key: "evidence.upload", label: "Upload evidence" },
      { key: "rfps.view", label: "View RFPs" },
      { key: "analytics.view", label: "View analytics" },
    ] as const;
    const permissionRows = await db
      .insert(permissions)
      .values([...PERMISSION_DEFS])
      .onConflictDoNothing()
      .returning();
    const permissionByKey = new Map(permissionRows.map((p) => [p.key, p.id]));
    // onConflictDoNothing means a re-seed won't return rows already present; refetch to be safe.
    const allPermissions = await db.select().from(permissions);
    for (const p of allPermissions) permissionByKey.set(p.key, p.id);

    const ROLE_DEFS: { name: string; description: string; permissionKeys: string[] }[] = [
      {
        name: "Admin",
        description: "Full access to org settings, billing, and all RFPs.",
        permissionKeys: ["org.manage", "members.manage", "integrations.manage", "rfps.full_access"],
      },
      {
        name: "Proposal Manager",
        description: "Creates and owns RFPs, assigns reviewers, generates submissions.",
        permissionKeys: [
          "rfps.create",
          "reviewers.assign",
          "submissions.generate",
          "answers.edit_all",
        ],
      },
      {
        name: "Reviewer",
        description: "Reviews and approves assigned requirements within their domain.",
        permissionKeys: ["answers.approve", "reviews.request_changes", "requirements.comment"],
      },
      {
        name: "Contributor",
        description: "Drafts and edits answers for assigned requirements.",
        permissionKeys: ["answers.edit_assigned", "evidence.upload", "requirements.comment"],
      },
      {
        name: "Viewer",
        description: "Read-only access to RFPs and analytics.",
        permissionKeys: ["rfps.view", "analytics.view"],
      },
    ];
    const roleByName = new Map<string, string>();
    for (const def of ROLE_DEFS) {
      const [role] = await db
        .insert(roles)
        .values({ organizationId: organizationId, name: def.name, description: def.description })
        .returning();
      if (!role) continue;
      roleByName.set(def.name, role.id);
      const permRows = def.permissionKeys
        .map((k) => permissionByKey.get(k))
        .filter((id): id is string => Boolean(id));
      if (permRows.length) {
        await db
          .insert(rolePermissions)
          .values(permRows.map((permissionId) => ({ roleId: role.id, permissionId })));
      }
    }

    const PEOPLE = [
      {
        name: "Priya Nair",
        role: "Proposal Manager",
        team: "Bid Management",
        email: "priya.nair@halcyonsystems.com",
      },
      {
        name: "Marcus Webb",
        role: "Reviewer",
        team: "Security & Compliance",
        email: "marcus.webb@halcyonsystems.com",
      },
      {
        name: "Elena Fischer",
        role: "Reviewer",
        team: "Legal",
        email: "elena.fischer@halcyonsystems.com",
      },
      {
        name: "David Okafor",
        role: "Contributor",
        team: "Architecture",
        email: "david.okafor@halcyonsystems.com",
      },
      {
        name: "Sana Raza",
        role: "Contributor",
        team: "Commercial",
        email: "sana.raza@halcyonsystems.com",
      },
      {
        name: "Tom Bergstrom",
        role: "Contributor",
        team: "Product",
        email: "tom.bergstrom@halcyonsystems.com",
      },
      {
        name: "Grace Lin",
        role: "Reviewer",
        team: "Customer Support",
        email: "grace.lin@halcyonsystems.com",
      },
      {
        name: "James Whitfield",
        role: "Admin",
        team: "Sales",
        email: "james.whitfield@halcyonsystems.com",
      },
      {
        name: "Aisha Malik",
        role: "Reviewer",
        team: "Compliance",
        email: "aisha.malik@halcyonsystems.com",
      },
      {
        name: "Ravi Chandran",
        role: "Contributor",
        team: "Knowledge Ops",
        email: "ravi.chandran@halcyonsystems.com",
      },
    ] as const;

    const userByEmail = new Map<string, string>();
    for (const p of PEOPLE) {
      const [user] = await db
        .insert(users)
        .values({
          organizationId: organizationId,
          roleId: roleByName.get(p.role),
          name: p.name,
          email: p.email,
          team: p.team,
          jobTitle: p.role,
          memberRole: p.role,
          status: "active",
          lastActiveAt: new Date(),
        })
        .returning();
      if (user) userByEmail.set(p.email, user.id);
    }

    /*
     * Memberships are what authorization reads (users.organization_id is only a
     * default), so seeding users without them would leave a freshly reset
     * database that nobody can sign in to. The migration backfill covers
     * existing installs; this covers new ones.
     *
     * The prototype's role tiers map onto the platform roles, and the first
     * person becomes OWNER so the organization is administrable.
     */
    const ROLE_TO_ORG_ROLE = {
      Admin: "ADMIN",
      "Proposal Manager": "RFP_MANAGER",
      Contributor: "CONTRIBUTOR",
      Reviewer: "REVIEWER",
      Viewer: "VIEWER",
    } as const;

    const organizationMemberRows = await db
      .insert(organizationMembers)
      .values(
        PEOPLE.map((p, index) => ({
          organizationId,
          userId: userByEmail.get(p.email)!,
          role: index === 0 ? ("OWNER" as const) : ROLE_TO_ORG_ROLE[p.role],
          status: "active" as const,
        })),
      )
      .returning();
    const organizationMemberByEmail = new Map<string, string>();
    for (const member of organizationMemberRows) {
      const email = PEOPLE.find((p) => userByEmail.get(p.email) === member.userId)?.email;
      if (email) organizationMemberByEmail.set(email, member.id);
    }

    const [workspace] = await db
      .insert(workspaces)
      .values({
        organizationId,
        name: "Delivery Workspace",
        slug: "delivery-workspace",
        description: "Primary workspace for live opportunities, pipeline, and submissions.",
        status: "active",
      })
      .returning();
    if (!workspace) throw new Error("Failed to seed workspace.");
    const workspaceId = workspace.id;

    await db.insert(workspaceMembers).values(
      PEOPLE.map((p) => ({
        workspaceId: workspace.id,
        organizationMemberId: organizationMemberByEmail.get(p.email)!,
        status: "active" as const,
      })),
    );

    const [bidOpsTeam] = await db
      .insert(teams)
      .values({
        organizationId,
        workspaceId: workspace.id,
        name: "Bid Operations",
        description: "Owns intake, pipeline movement, and submission coordination.",
        status: "active",
      })
      .returning();
    const [governanceTeam] = await db
      .insert(teams)
      .values({
        organizationId,
        workspaceId: workspace.id,
        name: "Governance & Review",
        description: "Reviews answers, evidence, and risk before submission.",
        status: "active",
      })
      .returning();

    if (bidOpsTeam) {
      await db.insert(teamMembers).values([
        { teamId: bidOpsTeam.id, organizationMemberId: organizationMemberByEmail.get("priya.nair@halcyonsystems.com")! },
        { teamId: bidOpsTeam.id, organizationMemberId: organizationMemberByEmail.get("david.okafor@halcyonsystems.com")! },
        { teamId: bidOpsTeam.id, organizationMemberId: organizationMemberByEmail.get("sana.raza@halcyonsystems.com")! },
      ]);
    }
    if (governanceTeam) {
      await db.insert(teamMembers).values([
        { teamId: governanceTeam.id, organizationMemberId: organizationMemberByEmail.get("marcus.webb@halcyonsystems.com")! },
        { teamId: governanceTeam.id, organizationMemberId: organizationMemberByEmail.get("elena.fischer@halcyonsystems.com")! },
        { teamId: governanceTeam.id, organizationMemberId: organizationMemberByEmail.get("aisha.malik@halcyonsystems.com")! },
      ]);
    }
    const priya = userByEmail.get("priya.nair@halcyonsystems.com")!;
    const marcus = userByEmail.get("marcus.webb@halcyonsystems.com")!;
    const elena = userByEmail.get("elena.fischer@halcyonsystems.com")!;
    const david = userByEmail.get("david.okafor@halcyonsystems.com")!;
    const aisha = userByEmail.get("aisha.malik@halcyonsystems.com")!;
    const ravi = userByEmail.get("ravi.chandran@halcyonsystems.com")!;

    // --- Knowledge sources -----------------------------------------------
    const [socReport] = await db
      .insert(knowledgeSources)
      .values({
        organizationId: organizationId,
        name: "SOC 2 Type II Report",
        type: "Audit Report",
        category: "Security",
        version: "2026.1",
        authority: "high",
        ownerId: marcus,
        lastVerified: "2026-07-28",
        lastUpdated: "2026-06-01",
        expiresAt: "2027-06-01",
        summary:
          "Independent Type II attestation covering security, availability, and confidentiality controls for the core platform.",
      })
      .returning();
    const [caiq] = await db
      .insert(knowledgeSources)
      .values({
        organizationId: organizationId,
        name: "Master Security Questionnaire (CAIQ)",
        type: "Questionnaire",
        category: "Security",
        version: "4.1",
        authority: "high",
        ownerId: marcus,
        lastVerified: "2026-04-11",
        lastUpdated: "2026-04-11",
        expiresAt: "2026-10-11",
        summary:
          "CSA CAIQ v4.1 self-assessment covering identity, data security, and infrastructure controls.",
      })
      .returning();
    await db
      .insert(knowledgeSources)
      .values({
        organizationId: organizationId,
        name: "Standard Commercial Terms Playbook",
        type: "Playbook",
        category: "Commercial",
        version: "5.0",
        authority: "medium",
        ownerId: userByEmail.get("sana.raza@halcyonsystems.com"),
        lastVerified: "2026-07-15",
        lastUpdated: "2026-07-15",
        expiresAt: "2027-01-15",
        summary:
          "Approved fallback positions for pricing structure, payment terms, and liability caps.",
      })
      .returning();

    if (socReport) {
      await db.insert(knowledgeClaims).values([
        {
          sourceId: socReport.id,
          label: "Audit period",
          value: "Jan 1, 2026 - Jun 30, 2026",
          confidence: "0.98",
        },
        {
          sourceId: socReport.id,
          label: "Exceptions noted",
          value: "0 exceptions",
          confidence: "0.95",
        },
      ]);
      await db.insert(knowledgeVersions).values([
        {
          sourceId: socReport.id,
          version: "2026.1",
          date: "2026-06-01",
          note: "H1 2026 audit cycle, no exceptions.",
        },
      ]);
    }
    if (caiq) {
      await db.insert(knowledgeClaims).values([
        {
          sourceId: caiq.id,
          label: "Encryption at rest",
          value: "AES-256, per-tenant keys",
          confidence: "0.94",
        },
        {
          sourceId: caiq.id,
          label: "MFA enforcement",
          value: "Required for all privileged roles",
          confidence: "0.9",
        },
      ]);
      const [conflict] = await db
        .insert(knowledgeConflicts)
        .values({
          sourceId: caiq.id,
          topic: "Key rotation interval",
          recommended: "90-day automatic rotation",
          action: "Retire the outdated whitepaper claim and cite CAIQ v4.1 in all new answers.",
        })
        .returning();
      if (conflict) {
        await db.insert(knowledgeConflictVariants).values([
          { conflictId: conflict.id, label: "CAIQ v4.1", value: "90-day automatic rotation" },
          {
            conflictId: conflict.id,
            label: "Security Whitepaper (2025)",
            value: "Annual rotation",
          },
        ]);
      }
    }

    // --- Customers & RFPs --------------------------------------------------
    const [meridian] = await db
      .insert(customers)
      .values({
        organizationId: organizationId,
        name: "Meridian Health Systems",
        industry: "Healthcare",
      })
      .returning();
    const [northwind] = await db
      .insert(customers)
      .values({
        organizationId: organizationId,
        name: "Northwind Retail Group",
        industry: "Retail",
      })
      .returning();
    if (!meridian || !northwind) throw new Error("Failed to seed customers.");

    const [rfp1] = await db
      .insert(rfps)
      .values({
        organizationId: organizationId,
        customerId: meridian.id,
        title: "Enterprise Cloud Platform RFP",
        opportunity: "Enterprise Platform Expansion",
        ownerId: priya,
        deadline: "2026-09-24",
        estimatedValue: "2500000",
        status: "in_progress",
      })
      .returning();
    const [rfp2] = await db
      .insert(rfps)
      .values({
        organizationId: organizationId,
        customerId: northwind.id,
        title: "Customer Data Platform RFP",
        opportunity: "CDP Modernization",
        ownerId: priya,
        deadline: "2026-09-10",
        estimatedValue: "980000",
        status: "review",
      })
      .returning();
    if (!rfp1 || !rfp2) throw new Error("Failed to seed RFPs.");

    await db.insert(rfpCollaborators).values([
      { rfpId: rfp1.id, userId: priya },
      { rfpId: rfp1.id, userId: marcus },
      { rfpId: rfp1.id, userId: elena },
      { rfpId: rfp2.id, userId: priya },
      { rfpId: rfp2.id, userId: david },
    ]);

    await db.insert(rfpDocuments).values([
      {
        organizationId: org.id,
        rfpId: rfp1.id,
        filename: "RFP_Questionnaire.pdf",
        type: "PDF",
        sizeMb: "4.2",
        status: "parsed",
        uploadedBy: priya,
      },
      {
        organizationId: org.id,
        rfpId: rfp1.id,
        filename: "Technical_Requirements.docx",
        type: "DOCX",
        sizeMb: "1.8",
        status: "parsed",
        uploadedBy: priya,
      },
      {
        organizationId: org.id,
        rfpId: rfp2.id,
        filename: "Pricing.xlsx",
        type: "XLSX",
        sizeMb: "0.6",
        status: "parsed",
        uploadedBy: priya,
      },
    ]);

    const REQUIREMENTS_RFP1: {
      code: string;
      title: string;
      question: string;
      category: NonNullable<(typeof rfpRequirements.$inferInsert)["category"]>;
      mandatory: boolean;
      risk: NonNullable<(typeof rfpRequirements.$inferInsert)["risk"]>;
      riskRationale: string;
      ownerTeam: string;
      status: NonNullable<(typeof rfpRequirements.$inferInsert)["status"]>;
      answer: string;
      confidence: number;
      generatedBy: NonNullable<(typeof rfpAnswers.$inferInsert)["generatedBy"]>;
      evidenceFrom?: string;
      reviewerId?: string;
    }[] = [
      {
        code: "MH-SEC-01",
        title: "Data encryption at rest",
        question: "Describe how customer data is encrypted at rest.",
        category: "Security",
        mandatory: true,
        risk: "low",
        riskRationale: "Well-documented, high-authority source available.",
        ownerTeam: "Security & Compliance",
        status: "approved",
        answer:
          "All customer data at rest is encrypted using AES-256 with per-tenant data encryption keys managed via a dedicated KMS.",
        confidence: 0.94,
        generatedBy: "ai_draft",
        evidenceFrom: "caiq",
        reviewerId: marcus,
      },
      {
        code: "MH-SEC-04",
        title: "Vulnerability management",
        question: "What is your remediation SLA for critical vulnerabilities?",
        category: "Security",
        mandatory: true,
        risk: "high",
        riskRationale: "Remediation SLA figures are not backed by a current, verifiable source.",
        ownerTeam: "Security & Compliance",
        status: "needs_review",
        answer:
          "Critical vulnerabilities are remediated within 7 days of confirmed identification.",
        confidence: 0.58,
        generatedBy: "ai_draft",
        reviewerId: marcus,
      },
      {
        code: "MH-SEC-05",
        title: "Incident notification SLA",
        question: "What is your customer notification SLA following a confirmed security incident?",
        category: "Security",
        mandatory: true,
        risk: "critical",
        riskRationale:
          "Customer notification SLA is not documented in any linked knowledge source.",
        ownerTeam: "Security & Compliance",
        status: "changes_requested",
        answer:
          "Customers are notified within 72 hours of a confirmed security incident affecting their data.",
        confidence: 0.41,
        generatedBy: "ai_draft",
        reviewerId: marcus,
      },
      {
        code: "MH-CMP-01",
        title: "HIPAA compliance posture",
        question: "Describe your HIPAA compliance controls and any BAA availability.",
        category: "Compliance",
        mandatory: true,
        risk: "high",
        riskRationale:
          "No dedicated HIPAA control mapping or BAA reference exists in the knowledge base.",
        ownerTeam: "Compliance",
        status: "needs_review",
        answer:
          'Draft response to: "Describe your HIPAA compliance controls" — a first pass covering compliance requirements, pending SME review before submission.',
        confidence: 0.5,
        generatedBy: "ai_draft",
        reviewerId: aisha,
      },
      {
        code: "MH-LGL-02",
        title: "Termination for convenience",
        question: "What termination for convenience terms do you offer?",
        category: "Legal",
        mandatory: false,
        risk: "medium",
        riskRationale:
          "90-day termination for convenience term has not been confirmed against the current legal playbook.",
        ownerTeam: "Legal",
        status: "changes_requested",
        answer:
          "Either party may terminate this agreement for convenience with 90 days written notice.",
        confidence: 0.72,
        generatedBy: "human_edited",
        reviewerId: elena,
      },
      {
        code: "MH-COM-03",
        title: "Standard payment terms",
        question: "What are your standard payment terms?",
        category: "Commercial",
        mandatory: false,
        risk: "low",
        riskRationale: "Directly sourced from the approved commercial playbook.",
        ownerTeam: "Commercial",
        status: "unanswered",
        answer: "",
        confidence: 0,
        generatedBy: "ai_draft",
      },
    ];

    const REQUIREMENTS_RFP2: (typeof REQUIREMENTS_RFP1)[number][] = [
      {
        code: "NW-CMP-01",
        title: "CCPA compliance",
        question: "Describe your CCPA compliance controls for California consumer data.",
        category: "Compliance",
        mandatory: true,
        risk: "critical",
        riskRationale: "Mandatory privacy law question has not been drafted yet.",
        ownerTeam: "Compliance",
        status: "unanswered",
        answer: "",
        confidence: 0,
        generatedBy: "ai_draft",
      },
      {
        code: "NW-SEC-01",
        title: "PII tokenization",
        question: "Describe your approach to tokenizing personally identifiable information.",
        category: "Security",
        mandatory: true,
        risk: "high",
        riskRationale: "No dedicated tokenization control document exists in the knowledge base.",
        ownerTeam: "Security & Compliance",
        status: "drafted",
        answer:
          "PII fields are tokenized at ingestion using a dedicated tokenization service with format-preserving encryption.",
        confidence: 0.62,
        generatedBy: "ai_draft",
        reviewerId: marcus,
      },
      {
        code: "NW-PRD-01",
        title: "Identity resolution accuracy",
        question: "What is your identity resolution match precision?",
        category: "Product",
        mandatory: false,
        risk: "medium",
        riskRationale:
          "Cited match precision figure is from an older internal source pending re-validation.",
        ownerTeam: "Product",
        status: "approved",
        answer:
          "Our identity resolution engine achieves 98.2% match precision across deterministic and probabilistic matching.",
        confidence: 0.81,
        generatedBy: "human_edited",
        reviewerId: userByEmail.get("tom.bergstrom@halcyonsystems.com")!,
      },
    ];

    async function seedRequirements(rfpId: string, defs: typeof REQUIREMENTS_RFP1) {
      for (const def of defs) {
        const [req] = await db
          .insert(rfpRequirements)
          .values({
            rfpId,
            code: def.code,
            title: def.title,
            question: def.question,
            category: def.category,
            mandatory: def.mandatory,
            risk: def.risk,
            riskRationale: def.riskRationale,
            ownerTeam: def.ownerTeam,
            status: def.status,
            reviewerId: def.reviewerId,
            dueDate: "2026-08-25",
          })
          .returning();
        if (!req) continue;

        await db.insert(rfpRisks).values({
          requirementId: req.id,
          level: def.risk,
          rationale: def.riskRationale,
          setBy: priya,
        });

        if (def.answer) {
          const [answer] = await db
            .insert(rfpAnswers)
            .values({
              requirementId: req.id,
              answer: def.answer,
              confidence: String(def.confidence),
              generatedBy: def.generatedBy,
              isCurrent: true,
            })
            .returning();

          if (answer && def.evidenceFrom === "caiq" && caiq) {
            await db.insert(rfpEvidence).values({
              answerId: answer.id,
              sourceId: caiq.id,
              title: "CAIQ - Encryption at rest control",
              excerpt:
                "All customer data at rest is encrypted using AES-256 with per-tenant data encryption keys managed via a dedicated KMS.",
              relevance: "0.94",
              verifiedAt: "2026-04-11",
              verifiedBy: marcus,
            });
          }
        }

        if (def.reviewerId) {
          await db.insert(rfpAssignments).values({
            requirementId: req.id,
            userId: def.reviewerId,
            role: "reviewer",
            deadline: "2026-08-25",
            status:
              def.status === "approved"
                ? "approved"
                : def.status === "changes_requested"
                  ? "changes_requested"
                  : "pending",
          });
          if (def.status === "approved") {
            await db
              .insert(rfpReviews)
              .values({ requirementId: req.id, reviewerId: def.reviewerId, action: "APPROVED" });
          } else if (def.status === "changes_requested") {
            await db.insert(rfpReviews).values({
              requirementId: req.id,
              reviewerId: def.reviewerId,
              action: "REQUEST_CHANGES",
              comment: "Needs a verifiable source before this can be approved.",
            });
          }
        }

        await db.insert(activities).values({
          organizationId: organizationId,
          rfpId,
          requirementId: req.id,
          actorId: priya,
          actorLabel: "AI Assistant",
          kind: "generated",
          label: `Draft generated for ${req.code}`,
        });
      }
    }

    await seedRequirements(rfp1.id, REQUIREMENTS_RFP1);
    await seedRequirements(rfp2.id, REQUIREMENTS_RFP2);

    await db.insert(activities).values([
      {
        organizationId: organizationId,
        rfpId: rfp1.id,
        actorId: priya,
        kind: "generated",
        label: `New RFP created — ${rfp1.title}`,
      },
      {
        organizationId: organizationId,
        rfpId: rfp2.id,
        actorId: priya,
        kind: "generated",
        label: `New RFP created — ${rfp2.title}`,
      },
    ]);

    // --- Tender pipeline ---------------------------------------------------
    const DEMO_NOW = new Date("2026-08-31T09:00:00Z");
    const daysFromDemoNow = (days: number) => new Date(DEMO_NOW.getTime() + days * 86400000);

    const [vertex] = await db
      .insert(customers)
      .values({
        organizationId,
        name: "Vertex Logistics",
        industry: "Transportation",
      })
      .returning();
    if (!vertex) throw new Error("Failed to seed third customer.");

    async function seedTenderDetails(input: {
      tenderId: string;
      ownerId: string;
      reviewerId: string;
      questionNumber: string;
      questionText: string;
      requirementCode: string;
      requirementTitle: string;
      requirementDescription: string;
      requirementType: NonNullable<(typeof tenderRequirements.$inferInsert)["requirementType"]>;
      answerText: string;
      answerStatus: NonNullable<(typeof tenderAnswers.$inferInsert)["status"]>;
      reviewStatus: NonNullable<(typeof tenderAnswerReviews.$inferInsert)["status"]>;
      score: number;
      ready: boolean;
      issueTitle: string;
      issueDetail: string;
      pipelineStage: string;
    }) {
      const [question] = await db
        .insert(tenderQuestions)
        .values({
          organizationId,
          workspaceId,
          tenderId: input.tenderId,
          questionNumber: input.questionNumber,
          section: "Overview",
          questionText: input.questionText,
          questionType: "TEXT",
          required: true,
          status: "ANSWERED",
          sourceReference: { section: "overview", questionNumber: input.questionNumber },
          sortOrder: 1,
          metadata: {},
        })
        .returning();
      const [requirement] = await db
        .insert(tenderRequirements)
        .values({
          organizationId,
          workspaceId,
          tenderId: input.tenderId,
          requirementCode: input.requirementCode,
          title: input.requirementTitle,
          description: input.requirementDescription,
          requirementType: input.requirementType,
          mandatory: true,
          status: "APPROVED",
          sourceReference: { section: "overview", requirementCode: input.requirementCode },
          metadata: { pipelineStage: input.pipelineStage },
        })
        .returning();
      if (question && requirement) {
        await db.insert(tenderQuestionRequirements).values({
          organizationId,
          workspaceId,
          questionId: question.id,
          requirementId: requirement.id,
        });
        const [answer] = await db
          .insert(tenderAnswers)
          .values({
            organizationId,
            workspaceId,
            tenderId: input.tenderId,
            questionId: question.id,
            answerText: input.answerText,
            status: input.answerStatus,
            source: input.answerStatus === "FINAL" ? "MANUAL" : "AI_GENERATED",
            confidence: input.answerStatus === "FINAL" ? "0.94" : "0.78",
            createdBy: input.ownerId,
            updatedBy: input.ownerId,
            metadata: { pipelineStage: input.pipelineStage },
          })
          .returning();
        if (answer) {
          await db.insert(tenderAnswerReviews).values({
            organizationId,
            workspaceId,
            tenderId: input.tenderId,
            answerId: answer.id,
            reviewerId: input.reviewerId,
            status: input.reviewStatus,
            comment:
              input.reviewStatus === "APPROVED"
                ? "Approved for demo submission."
                : "Needs one more pass before submission.",
          });
        }
      }

      await db.insert(tenderValidationRuns).values({
        organizationId,
        workspaceId,
        tenderId: input.tenderId,
        score: input.score,
        ready: input.ready,
        categories: [
          {
            id: "coverage",
            label: "Coverage",
            value: Math.max(1, input.score - 18),
            total: 100,
            tone: "success",
            hint: "Answered questions and requirement coverage.",
          },
          {
            id: "risk",
            label: "Risk",
            value: input.score < 70 ? 42 : 12,
            total: 100,
            tone: input.score < 70 ? "warning" : "success",
            hint: "Outstanding review and evidence risk.",
          },
        ],
        issues: [
          {
            id: `${input.tenderId}-issue`,
            severity: input.ready ? "LOW" : "HIGH",
            title: input.issueTitle,
            detail: input.issueDetail,
            recommendation: input.ready
              ? "Continue monitoring readiness."
              : "Resolve the open review before submission.",
            blocking: !input.ready,
          },
        ],
        result: {
          tenderId: input.tenderId,
          score: input.score,
          ready: input.ready,
          issues: input.ready ? 0 : 1,
          pipelineStage: input.pipelineStage,
        },
        createdBy: input.ownerId,
      });
    }

    const tenderDefs = [
      {
        customerId: meridian.id,
        name: "Meridian Health Systems",
        title: "Enterprise Cloud Platform RFP",
        referenceNumber: "TH-26-001",
        description: "Migration and managed services for the core patient platform.",
        tenderType: "DOCUMENT" as const,
        sourceType: "DOCUMENT_UPLOAD" as const,
        sourceReference: { channel: "portal", intake: "uploaded" },
        sourceUrl: null,
        status: "IN_PROGRESS" as const,
        ownerId: priya,
        createdBy: priya,
        receivedAt: daysFromDemoNow(-21),
        dueAt: daysFromDemoNow(24),
        timezone: "Asia/Kolkata",
        metadata: {
          estimatedValue: 25000000,
          location: "Bengaluru, India",
          pipelineStage: "applying",
        },
        detail: {
          questionNumber: "Q-01",
          questionText: "Describe your encryption-at-rest controls and key management.",
          requirementCode: "MH-SEC-01",
          requirementTitle: "Encryption at rest",
          requirementDescription: "Confirm encryption and KMS ownership for production data.",
          requirementType: "SECURITY" as const,
          answerText: "All production data is encrypted with AES-256 and tenant-scoped keys in a managed KMS.",
          answerStatus: "IN_REVIEW" as const,
          reviewStatus: "CHANGES_REQUESTED" as const,
          score: 68,
          ready: false,
          issueTitle: "Security review still open",
          issueDetail: "The draft answer needs reviewer sign-off before submission.",
          pipelineStage: "applying",
          reviewerId: marcus,
        },
      },
      {
        customerId: northwind.id,
        name: "Northwind Retail Group",
        title: "Customer Data Platform RFP",
        referenceNumber: "NW-26-014",
        description: "Replacement CDP for ecommerce segmentation and campaign activation.",
        tenderType: "DOCUMENT" as const,
        sourceType: "EMAIL_IMPORT" as const,
        sourceReference: { channel: "email", inbox: "rfp@northwind.example" },
        sourceUrl: null,
        status: "REVIEW" as const,
        ownerId: priya,
        createdBy: priya,
        receivedAt: daysFromDemoNow(-17),
        dueAt: daysFromDemoNow(12),
        timezone: "Asia/Kolkata",
        metadata: {
          estimatedValue: 9800000,
          location: "Mumbai, India",
          pipelineStage: "response",
        },
        detail: {
          questionNumber: "Q-02",
          questionText: "What is your remediation SLA for critical vulnerabilities?",
          requirementCode: "NW-SEC-02",
          requirementTitle: "Critical vulnerability remediation",
          requirementDescription: "State the SLA for critical security issues.",
          requirementType: "SECURITY" as const,
          answerText: "Critical vulnerabilities are remediated within seven calendar days of verification.",
          answerStatus: "APPROVED" as const,
          reviewStatus: "APPROVED" as const,
          score: 84,
          ready: true,
          issueTitle: "Ready for executive review",
          issueDetail: "Only final quality checks remain before submission.",
          pipelineStage: "response",
          reviewerId: marcus,
        },
      },
      {
        customerId: vertex.id,
        name: "Vertex Logistics",
        title: "Managed Security Services RFP",
        referenceNumber: "VX-26-008",
        description: "24x7 managed security operations and incident response support.",
        tenderType: "ONLINE" as const,
        sourceType: "PORTAL" as const,
        sourceReference: { channel: "portal", intake: "live form" },
        sourceUrl: "https://vertex.example/rfp",
        status: "APPROVED" as const,
        ownerId: priya,
        createdBy: priya,
        receivedAt: daysFromDemoNow(-14),
        dueAt: daysFromDemoNow(6),
        timezone: "Asia/Kolkata",
        metadata: {
          estimatedValue: 18000000,
          location: "Delhi, India",
          pipelineStage: "approval",
        },
        detail: {
          questionNumber: "Q-03",
          questionText: "What is your customer incident notification SLA?",
          requirementCode: "VX-SEC-05",
          requirementTitle: "Incident notification SLA",
          requirementDescription: "Define the notification window for confirmed incidents.",
          requirementType: "SECURITY" as const,
          answerText: "Customers are notified within 72 hours of a confirmed incident affecting their environment.",
          answerStatus: "FINAL" as const,
          reviewStatus: "APPROVED" as const,
          score: 91,
          ready: true,
          issueTitle: "Approved for submission prep",
          issueDetail: "The response is fully approved and ready for final packaging.",
          pipelineStage: "approval",
          reviewerId: marcus,
        },
      },
      {
        customerId: meridian.id,
        name: "Meridian Health Systems",
        title: "Identity and Access Renewal",
        referenceNumber: "TH-26-004",
        description: "Renewal for IAM support and privileged access reviews.",
        tenderType: "DOCUMENT" as const,
        sourceType: "MANUAL" as const,
        sourceReference: { intake: "manual" },
        sourceUrl: null,
        status: "READY" as const,
        ownerId: priya,
        createdBy: priya,
        receivedAt: daysFromDemoNow(-9),
        dueAt: daysFromDemoNow(2),
        timezone: "Asia/Kolkata",
        metadata: {
          estimatedValue: 6400000,
          location: "Pune, India",
          pipelineStage: "ready",
        },
      },
      {
        customerId: northwind.id,
        name: "Northwind Retail Group",
        title: "Retail Analytics Platform Renewal",
        referenceNumber: "NW-26-017",
        description: "Annual renewal for analytics and reporting services.",
        tenderType: "DOCUMENT" as const,
        sourceType: "DOCUMENT_UPLOAD" as const,
        sourceReference: { channel: "portal", intake: "upload" },
        sourceUrl: null,
        status: "PROCESSING" as const,
        ownerId: priya,
        createdBy: priya,
        receivedAt: daysFromDemoNow(-6),
        dueAt: daysFromDemoNow(18),
        timezone: "Asia/Kolkata",
        metadata: {
          estimatedValue: 4200000,
          location: "Chennai, India",
          pipelineStage: "intake",
        },
      },
      {
        customerId: vertex.id,
        name: "Vertex Logistics",
        title: "Procurement Analytics Pilot",
        referenceNumber: "VX-26-011",
        description: "Pilot contract for procurement analytics and spend visibility.",
        tenderType: "ONLINE" as const,
        sourceType: "PORTAL" as const,
        sourceReference: { channel: "portal", intake: "live form" },
        sourceUrl: "https://vertex.example/pilot",
        status: "SUBMITTED" as const,
        ownerId: priya,
        createdBy: priya,
        receivedAt: daysFromDemoNow(-27),
        dueAt: daysFromDemoNow(-3),
        timezone: "Asia/Kolkata",
        metadata: {
          estimatedValue: 11000000,
          location: "Hyderabad, India",
          pipelineStage: "submitted",
        },
      },
    ] as const;

    for (const [index, def] of tenderDefs.entries()) {
      const [tender] = await db
        .insert(tenders)
        .values({
          organizationId,
          workspaceId: workspace.id,
          name: def.name,
          title: def.title,
          referenceNumber: def.referenceNumber,
          description: def.description,
          tenderType: def.tenderType,
          sourceType: def.sourceType,
          sourceReference: def.sourceReference,
          sourceUrl: def.sourceUrl,
          status: def.status,
          ownerId: def.ownerId,
          createdBy: def.createdBy,
          receivedAt: def.receivedAt,
          dueAt: def.dueAt,
          timezone: def.timezone,
          metadata: def.metadata,
        })
        .returning();
      if (!tender) continue;

      if ("detail" in def && def.detail) {
        await seedTenderDetails({
          tenderId: tender.id,
          ownerId: def.ownerId,
          reviewerId: def.detail.reviewerId,
          questionNumber: def.detail.questionNumber,
          questionText: def.detail.questionText,
          requirementCode: def.detail.requirementCode,
          requirementTitle: def.detail.requirementTitle,
          requirementDescription: def.detail.requirementDescription,
          requirementType: def.detail.requirementType,
          answerText: def.detail.answerText,
          answerStatus: def.detail.answerStatus,
          reviewStatus: def.detail.reviewStatus,
          score: def.detail.score,
          ready: def.detail.ready,
          issueTitle: def.detail.issueTitle,
          issueDetail: def.detail.issueDetail,
          pipelineStage: def.detail.pipelineStage,
        });
      }

      await db.insert(tenderStatusHistory).values({
        organizationId,
        workspaceId,
        tenderId: tender.id,
        fromStatus: null,
        toStatus: def.status,
        actorId: def.createdBy,
        reason: index === 0 ? "Initial import" : "Seeded demo opportunity",
        metadata: { pipelineStage: def.metadata.pipelineStage },
      });

      await db.insert(activities).values({
        organizationId,
          workspaceId,
        actorId: def.createdBy,
        actorLabel: "Seeded Demo",
        kind: "generated",
        label: `Pipeline opportunity loaded - ${def.title}`,
        action: "tender.created",
        entityType: "tender",
        entityId: tender.id,
        summary: `${def.title} is available in the pipeline`,
        metadata: { tenderId: tender.id, status: def.status, pipelineStage: def.metadata.pipelineStage },
      });
    }

    // --- Notifications for the default seeded user (Priya) -----------------
    await db.insert(notifications).values([
      {
        organizationId: organizationId,
        userId: priya,
        category: "Reviews",
        title: "Changes requested on MH-SEC-05",
        detail: "Marcus Webb requested changes — incident notification SLA is unsupported.",
        severity: "danger",
        read: false,
      },
      {
        organizationId: organizationId,
        userId: priya,
        category: "Deadlines",
        title: `${northwind.name} due soon`,
        detail: "Customer Data Platform RFP has mandatory gaps outstanding.",
        severity: "warning",
        read: false,
      },
      {
        organizationId: organizationId,
        userId: priya,
        category: "Knowledge",
        title: "Conflicting claim detected",
        detail: "Key rotation interval conflicts across two knowledge sources.",
        severity: "warning",
        read: true,
      },
      {
        organizationId: organizationId,
        userId: priya,
        category: "Assignments",
        title: "Pipeline review queued",
        detail: "Managed Security Services RFP is approved and ready for final packaging.",
        severity: "info",
        read: false,
      },
    ]);

    // --- Settings-page config ------------------------------------------------
    await db.insert(integrations).values([
      {
        organizationId: organizationId,
        name: "Salesforce",
        category: "CRM",
        connected: true,
        description: "Sync opportunities and customer records.",
        lastSyncedAt: new Date(),
      },
      {
        organizationId: organizationId,
        name: "SharePoint",
        category: "Document storage",
        connected: true,
        description: "Import RFP documents and export packages.",
        lastSyncedAt: new Date(),
      },
      {
        organizationId: organizationId,
        name: "Slack",
        category: "Notifications",
        connected: false,
        description: "Send review assignments and risk alerts to Slack.",
      },
      {
        organizationId: organizationId,
        name: "DocuSign",
        category: "E-signature",
        connected: false,
        description: "Route submission packages for e-signature.",
      },
    ]);
    await db.insert(notificationPreferences).values([
      {
        organizationId: organizationId,
        category: "Reviews",
        label: "Review assigned or completed",
        email: true,
        inApp: true,
        digest: false,
      },
      {
        organizationId: organizationId,
        category: "Deadlines",
        label: "Deadline approaching (7, 3, 1 day)",
        email: true,
        inApp: true,
        digest: true,
      },
      {
        organizationId: organizationId,
        category: "Knowledge",
        label: "Source freshness or conflicts",
        email: false,
        inApp: true,
        digest: true,
      },
    ]);
    await db.insert(apiKeys).values([
      {
        organizationId: organizationId,
        label: "Production integration key",
        prefix: "rfpos_live_8f2a",
        scopes: ["rfps:read", "requirements:read"],
      },
    ]);
    await db.insert(mcpConnections).values([
      {
        organizationId: organizationId,
        name: "Knowledge Base Server",
        transport: "http",
        status: "connected",
        toolsExposed: 6,
        description: "Exposes search and freshness checks over the knowledge library.",
      },
      {
        organizationId: organizationId,
        name: "Document Generation Server",
        transport: "stdio",
        status: "connected",
        toolsExposed: 3,
        description: "Renders submission packages into customer-formatted documents.",
      },
    ]);
    await db.insert(configToggles).values([
      {
        organizationId,
        group: "ai",
        sortOrder: 1,
        label: "Auto-draft new requirements",
        description: "Generate an AI draft answer automatically when requirements are extracted.",
        kind: "toggle",
        value: true,
      },
      {
        organizationId,
        group: "ai",
        sortOrder: 2,
        label: "Minimum confidence to auto-draft",
        description: "Requirements below this confidence are left unanswered for manual drafting.",
        kind: "slider",
        value: 55,
      },
      {
        organizationId,
        group: "ai",
        sortOrder: 3,
        label: "Preferred drafting tone",
        description: "Tone applied to generated answers.",
        kind: "select",
        value: "Formal",
        options: ["Formal", "Consultative", "Concise"],
      },
      {
        organizationId,
        group: "ai",
        sortOrder: 4,
        label: "Flag low-evidence answers for review",
        description: "Automatically route answers with fewer than 2 evidence sources to review.",
        kind: "toggle",
        value: true,
      },
      {
        organizationId,
        group: "ai",
        sortOrder: 5,
        label: "Reuse prior won RFP answers",
        description:
          "Allow the assistant to draft from prior won proposals when no primary source exists.",
        kind: "toggle",
        value: true,
      },
      {
        organizationId,
        group: "ai",
        sortOrder: 6,
        label: "Auto-regenerate on source update",
        description: "Re-draft answers automatically when a linked knowledge source is updated.",
        kind: "toggle",
        value: false,
      },
      {
        organizationId,
        group: "knowledge",
        sortOrder: 1,
        label: "Freshness warning threshold",
        description: "Mark a source as aging after this many days since verification.",
        kind: "slider",
        value: 90,
      },
      {
        organizationId,
        group: "knowledge",
        sortOrder: 2,
        label: "Stale threshold",
        description: "Mark a source as stale after this many days since verification.",
        kind: "slider",
        value: 180,
        max: 365,
      },
      {
        organizationId,
        group: "knowledge",
        sortOrder: 3,
        label: "Require owner sign-off on new sources",
        description: "New knowledge sources must be approved by a designated owner before use.",
        kind: "toggle",
        value: true,
      },
      {
        organizationId,
        group: "knowledge",
        sortOrder: 4,
        label: "Auto-detect conflicting claims",
        description:
          "Scan new sources for claims that conflict with existing high-authority sources.",
        kind: "toggle",
        value: true,
      },
    ]);

    console.log(`Seed complete. Organization: ${organizationId}`);
    console.log(`Default dev user (Priya Nair): ${priya} <priya.nair@halcyonsystems.com>`);
    console.log(`RFP 1: ${rfp1.id} (${rfp1.title})`);
    console.log(`RFP 2: ${rfp2.id} (${rfp2.title})`);
    void [david, ravi];
  } finally {
    await closeDb();
  }
}

if (import.meta.main) {
  seedDevelopmentData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
