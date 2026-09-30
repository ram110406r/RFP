import { randomUUID } from "node:crypto";

import {
  getDb,
  knowledgeClaims,
  knowledgeSources,
  knowledgeVersions,
  organizationMembers,
  organizations,
  tenders,
  users,
  workspaces,
} from "../packages/db/src/index";

type BoundaryStatus = "PASS" | "FAIL" | "BLOCKED";

type BoundaryResult = {
  boundary: string;
  status: BoundaryStatus;
  detail: string;
};

const API_BASE = "http://localhost:4100/api/v1";
const results: BoundaryResult[] = [];

function record(boundary: string, status: BoundaryStatus, detail: string) {
  results.push({ boundary, status, detail });
  console.log(`${status} | ${boundary} | ${detail}`);
}

async function requestJson<T>(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T | null; text: string }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as T) : null;
  return { status: response.status, json, text };
}

async function requestBinary(url: string, method: string, body: Uint8Array, contentType: string) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": contentType,
    },
    body,
  });
  const text = await response.text();
  return { status: response.status, text };
}

function minimalPdfBytes() {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj",
    "4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
    "5 0 obj<< /Length 42 >>stream",
    "BT /F1 18 Tf 40 120 Td (Step 4 RFP) Tj ET",
    "endstream endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000010 00000 n ",
    "0000000060 00000 n ",
    "0000000119 00000 n ",
    "0000000251 00000 n ",
    "0000000321 00000 n ",
    "trailer<< /Root 1 0 R /Size 6 >>",
    "startxref",
    "394",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}

function isoDate(daysOffset = 0) {
  const date = new Date("2026-08-27T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString();
}

async function main() {
  const db = getDb();

  const login = await fetch(`${API_BASE}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!login.ok) {
    throw new Error(`Dev login failed with HTTP ${login.status}`);
  }

  const loginBody = (await login.json()) as { token?: string; user?: { id?: string; email?: string } };
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookieMatch = setCookie.match(/better-auth\.session_token=[^;]+/);
  if (!cookieMatch) {
    throw new Error("Missing session cookie from dev login.");
  }
  const cookie = cookieMatch[0];

  const me = await requestJson<{
    userId: string;
    organizationId: string;
    role: string;
    permissions: string[];
  }>(cookie, "GET", "/auth/me");
  if (me.status !== 200 || !me.json?.organizationId) {
    record("auth/session", "FAIL", `Auth/me returned HTTP ${me.status}: ${me.text}`);
    return;
  }
  record(
    "auth/session",
    "PASS",
    `Authenticated as ${me.json.userId} in org ${me.json.organizationId} with role ${me.json.role}.`,
  );

  const runTag = randomUUID().slice(0, 8);
  const workspaceList = await requestJson<{ items: Array<{ id: string; name: string; slug: string }> }>(
    cookie,
    "GET",
    "/workspaces",
  );
  let workspaceId = workspaceList.json?.items[0]?.id ?? null;
  if (!workspaceId) {
    const createdWorkspace = await requestJson<{ id: string; name: string; slug: string }>(cookie, "POST", "/workspaces", {
      name: "Step 4 Acceptance Workspace",
      slug: `step-4-${runTag}`,
      description: "Live workspace for Step 4 acceptance validation.",
    });
    if (!(createdWorkspace.status >= 200 && createdWorkspace.status < 300 && createdWorkspace.json?.id)) {
      record("workspace/create", "FAIL", `Workspace creation failed: HTTP ${createdWorkspace.status} ${createdWorkspace.text}`);
      return;
    }
    workspaceId = createdWorkspace.json.id;
    record("workspace/create", "PASS", `Created workspace ${workspaceId}.`);
  } else {
    record("workspace/create", "PASS", `Using existing workspace ${workspaceId}.`);
  }

  const tenderCreate = await requestJson<{ id: string; workspaceId: string; title: string; status: string }>(
    cookie,
    "POST",
    "/tenders",
    {
      workspaceId,
      name: "Northwind Retail Group",
      title: "Customer Data Platform RFP",
      referenceNumber: `NW-RFP-${new Date().getFullYear()}-${runTag}`,
      description: "Live tender fixture for Step 4 acceptance validation.",
      tenderType: "DOCUMENT",
      sourceType: "DOCUMENT_UPLOAD",
      ownerId: loginBody.user?.id,
      receivedAt: isoDate(-1),
      dueAt: isoDate(28),
      timezone: "Asia/Kolkata",
      metadata: { fixture: true, scenario: "step-4" },
    },
  );
  if (!(tenderCreate.status >= 200 && tenderCreate.status < 300 && tenderCreate.json?.id)) {
    record("tender/create", "FAIL", `Tender creation failed: HTTP ${tenderCreate.status} ${tenderCreate.text}`);
    return;
  }
  const tenderId = tenderCreate.json.id;
  record("tender/create", "PASS", `Created tender ${tenderId} in workspace ${workspaceId}.`);

  const uploadIntent = await requestJson<{
    sourceId: string;
    fileId: string;
    uploadUrl: string;
    objectKey: string;
  }>(cookie, "POST", `/tenders/${tenderId}/sources`, {
    sourceType: "DOCUMENT",
    name: "Customer_Data_Platform_RFP.pdf",
    filename: "Customer_Data_Platform_RFP.pdf",
    mimeType: "application/pdf",
    sizeBytes: minimalPdfBytes().byteLength,
    metadata: { fixture: true, boundary: "step-4-upload" },
  });
  if (!(uploadIntent.status >= 200 && uploadIntent.status < 300 && uploadIntent.json?.uploadUrl)) {
    record("rfp/upload", "FAIL", `Upload intent failed: HTTP ${uploadIntent.status} ${uploadIntent.text}`);
  } else {
    const pdfBytes = minimalPdfBytes();
    const put = await requestBinary(uploadIntent.json.uploadUrl, "PUT", pdfBytes, "application/pdf");
    if (put.status >= 200 && put.status < 300) {
      const complete = await requestJson<{ status: string; checksum: string | null }>(
        cookie,
        "POST",
        `/tenders/${tenderId}/sources/${uploadIntent.json.sourceId}/complete`,
      );
      if (complete.status >= 200 && complete.status < 300) {
        const parsed = await requestJson<{ parseStatus?: string; parsedAt?: string | null }>(
          cookie,
          "POST",
          `/tenders/${tenderId}/sources/${uploadIntent.json.sourceId}/parse`,
        );
        record(
          "rfp/parse",
          parsed.status >= 200 && parsed.status < 300 && parsed.json?.parseStatus === "PARSED" ? "PASS" : "FAIL",
          parsed.status >= 200 && parsed.status < 300 && parsed.json?.parseStatus === "PARSED"
            ? `Tender source ${uploadIntent.json.sourceId} parsed successfully.`
            : `Parse did not complete: HTTP ${parsed.status} ${parsed.text}`,
        );
      } else {
        record("rfp/parse", "FAIL", `Source completion failed: HTTP ${complete.status} ${complete.text}`);
      }
    } else {
      record("rfp/upload", "FAIL", `Upload PUT failed with HTTP ${put.status}: ${put.text}`);
    }
  }

  const requirementFixtures = [
    {
      code: "STEP4-SUP-01",
      title: "SCIM capability overview",
      description: "Describe your SCIM capability.",
      question: "Describe your SCIM capability.",
      answerMode: "supported",
      requirementType: "SECURITY",
      sourceName: "SCIM capability overview",
      sourceSummary: "SCIM capability overview with approved directory sync support.",
      sourceAuthority: "high",
      claim: "SCIM capability overview",
    },
    {
      code: "STEP4-WEAK-01",
      title: "Zebra ledger checksum",
      description: "Explain your zebra ledger checksum.",
      question: "Explain your zebra ledger checksum.",
      answerMode: "weak",
      requirementType: "TECHNICAL",
      sourceName: "Zebra maintenance memo",
      sourceSummary: "General operational memo without any checksum commitments.",
      sourceAuthority: "low",
      claim: "Zebra maintenance memo",
    },
    {
      code: "STEP4-PART-01",
      title: "Atlas support bulletin",
      description: "Do you support Atlas deployment?",
      question: "Do you support Atlas deployment?",
      answerMode: "partial",
      requirementType: "DOCUMENTATION",
      sourceName: "Atlas support bulletin",
      sourceSummary: "Atlas support bulletin describing deployment support options.",
      sourceAuthority: "high",
      claim: "Atlas support bulletin",
    },
    {
      code: "STEP4-CONTR-01",
      title: "Foxtrot service commitment",
      description: "Explain your service commitment.",
      question: "Explain your service commitment.",
      answerMode: "contradictory",
      requirementType: "COMMERCIAL",
      sourceName: "Foxtrot service note",
      sourceSummary: "Service note describing business-hours support and an exception process.",
      sourceAuthority: "high",
      claim: "Foxtrot service note",
    },
    {
      code: "STEP4-REGEN-01",
      title: "Orion interoperability summary",
      description: "Describe your Orion interoperability.",
      question: "Describe your Orion interoperability.",
      answerMode: "regeneration",
      requirementType: "TECHNICAL",
      sourceName: "Orion interoperability summary",
      sourceSummary: "Orion interoperability summary covering integration support.",
      sourceAuthority: "high",
      claim: "Orion interoperability summary",
    },
    {
      code: "STEP4-UNAUTH-01",
      title: "Tenant A isolation probe",
      description: "Describe your tenant A isolation policy.",
      question: "Describe your tenant A isolation policy.",
      answerMode: "unauthorized",
      requirementType: "SECURITY",
      sourceName: "Tenant A isolation note",
      sourceSummary: "Tenant A scoped isolation guidance.",
      sourceAuthority: "high",
      claim: "Tenant A isolation note",
    },
  ] as const;

  const created: Array<{
    requirementId: string;
    questionId: string;
    sourceIds: string[];
    answerId?: string;
    initialVersionCount?: number;
  }> = [];

  for (const fixture of requirementFixtures) {
    const requirement = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/requirements`, {
      requirementCode: fixture.code,
      title: fixture.title,
      description: fixture.description,
      requirementType: fixture.requirementType,
      mandatory: true,
      status: "ASSIGNED",
      sourceReference: { section: "Step 4", source: "RFP" },
    });
    if (!(requirement.status >= 200 && requirement.status < 300 && requirement.json?.id)) {
      record(`requirement/create/${fixture.code}`, "FAIL", `Requirement creation failed: HTTP ${requirement.status} ${requirement.text}`);
      return;
    }

    const question = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/questions`, {
      questionNumber: fixture.code,
      section: "Step 4",
      questionText: fixture.question,
      questionType: "LONG_TEXT",
      required: true,
      status: "ASSIGNED",
      sortOrder: created.length + 1,
      requirementIds: [requirement.json.id],
      sourceReference: { page: 1 },
    });
    if (!(question.status >= 200 && question.status < 300 && question.json?.id)) {
      record(`question/create/${fixture.code}`, "FAIL", `Question creation failed: HTTP ${question.status} ${question.text}`);
      return;
    }

    created.push({ requirementId: requirement.json.id, questionId: question.json.id, sourceIds: [] });
  }
  record("requirement/question/create", "PASS", `Created ${created.length} requirement/question pairs.`);

  const now = isoDate();
  const orgId = me.json.organizationId;
  const supportedSourceId = randomUUID();
  const weakSourceId = randomUUID();
  const partialSourceId = randomUUID();
  const contradictionSourceId = randomUUID();
  const contradictionSourceId2 = randomUUID();
  const regenerationSourceId = randomUUID();
  const regenerationSourceId2 = randomUUID();

  const seededSources = [
    {
      id: supportedSourceId,
      name: "SCIM capability overview",
      category: "Security",
      authority: "high",
      lastVerified: now,
      lastUpdated: now,
      expiresAt: isoDate(365),
      summary: "SCIM capability overview with approved directory sync support.",
      claimLabel: "SCIM capability",
      claimValue: "SCIM provisioning and deprovisioning are supported.",
      claimConfidence: "0.99",
      version: "1.0",
      versionNote: "Approved SCIM capability summary.",
    },
    {
      id: weakSourceId,
      name: "Zebra maintenance memo",
      category: "Architecture",
      authority: "low",
      lastVerified: isoDate(-540),
      lastUpdated: isoDate(-540),
      expiresAt: isoDate(60),
      summary: "General operational memo without any checksum commitments.",
      claimLabel: "Zebra note",
      claimValue: "No checksum commitment is defined here.",
      claimConfidence: "0.20",
      version: "1.0",
      versionNote: "Non-binding maintenance note.",
    },
    {
      id: partialSourceId,
      name: "Atlas support bulletin",
      category: "Support",
      authority: "high",
      lastVerified: now,
      lastUpdated: now,
      expiresAt: isoDate(365),
      summary: "Atlas support bulletin describing deployment support options.",
      claimLabel: "Atlas support",
      claimValue: "Deployment support is available for Atlas.",
      claimConfidence: "0.98",
      version: "1.0",
      versionNote: "Atlas deployment support summary.",
    },
    {
      id: contradictionSourceId,
      name: "Foxtrot service note",
      category: "Commercial",
      authority: "high",
      lastVerified: now,
      lastUpdated: now,
      expiresAt: isoDate(365),
      summary: "Service note describing business-hours support and an exception process.",
      claimLabel: "Foxtrot service",
      claimValue: "Business-hours support is the standard operating model.",
      claimConfidence: "0.95",
      version: "1.0",
      versionNote: "Standard service note.",
    },
    {
      id: contradictionSourceId2,
      name: "Foxtrot exception memo",
      category: "Commercial",
      authority: "high",
      lastVerified: now,
      lastUpdated: now,
      expiresAt: isoDate(365),
      summary: "Exception memo describing a limited exception-only process.",
      claimLabel: "Foxtrot exception",
      claimValue: "Service exceptions are handled only by manual review.",
      claimConfidence: "0.96",
      version: "1.0",
      versionNote: "Exception handling note.",
    },
    {
      id: regenerationSourceId,
      name: "Orion interoperability summary",
      category: "Architecture",
      authority: "high",
      lastVerified: now,
      lastUpdated: now,
      expiresAt: isoDate(365),
      summary: "Orion interoperability summary covering integration support.",
      claimLabel: "Orion interoperability",
      claimValue: "Orion interoperability is described in the integration pack.",
      claimConfidence: "0.97",
      version: "1.0",
      versionNote: "Initial interoperability summary.",
    },
    {
      id: regenerationSourceId2,
      name: "Orion interoperability addendum",
      category: "Architecture",
      authority: "high",
      lastVerified: now,
      lastUpdated: now,
      expiresAt: isoDate(365),
      summary: "Orion interoperability addendum with extended integration detail.",
      claimLabel: "Orion addendum",
      claimValue: "Additional integration detail is available in the addendum.",
      claimConfidence: "0.99",
      version: "2.0",
      versionNote: "Extended interoperability addendum.",
    },
  ];

  for (const source of seededSources) {
    await db.insert(knowledgeSources).values({
      id: source.id,
      organizationId: orgId,
      name: source.name,
      type: "Policy",
      category: source.category,
      version: source.version,
      authority: source.authority,
      ownerId: loginBody.user?.id,
      lastVerified: source.lastVerified,
      lastUpdated: source.lastUpdated,
      expiresAt: source.expiresAt,
      summary: source.summary,
    });
    await db.insert(knowledgeClaims).values({
      sourceId: source.id,
      label: source.claimLabel,
      value: source.claimValue,
      confidence: source.claimConfidence,
    });
    await db.insert(knowledgeVersions).values({
      sourceId: source.id,
      version: source.version,
      date: source.lastUpdated.slice(0, 10),
      note: source.versionNote,
    });
  }

  const supportedFixture = created[0]!;
  const weakFixture = created[1]!;
  const partialFixture = created[2]!;
  const contradictionFixture = created[3]!;
  const regenerationFixture = created[4]!;
  const supportedGeneration = await requestJson<{
    answer: { id: string; answerText: string; status: string; source: string; confidence: number } | null;
    generation: {
      status: string;
      risk: string;
      evidenceState?: string;
      grounding?: { status: string; coverage: number; supportedClaims: number; unsupportedClaims: number };
      metadata?: { generation?: { selectedEvidence?: Array<{ evidenceId: string; sourceTitle?: string | null; sourceAuthority?: string | null }> } };
    };
    grounding?: { status: string; coverage: number };
    evidenceState?: string;
    reason?: string | null;
    suggestedAction?: string | null;
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${supportedFixture.requirementId}/answer/generate`);

  if (supportedGeneration.status >= 200 && supportedGeneration.status < 300 && supportedGeneration.json?.answer?.id) {
    const answer = supportedGeneration.json.answer;
    const generationStatus = supportedGeneration.json.generation.status;
    const groundingStatus = supportedGeneration.json.grounding?.status ?? supportedGeneration.json.generation.grounding?.status;
    record(
      "supported/evidence",
      generationStatus === "GENERATED" && groundingStatus === "SUPPORTED" ? "PASS" : "FAIL",
      `Answer ${answer.id} generated with status ${generationStatus}, grounding ${groundingStatus}, evidenceState ${supportedGeneration.json.evidenceState ?? supportedGeneration.json.generation.evidenceState ?? "n/a"}.`,
    );
    supportedFixture.answerId = answer.id;
    const versions = await requestJson<{ items: Array<{ versionNumber: number; content: string }> }>(
      cookie,
      "GET",
      `/tenders/${tenderId}/answers/${answer.id}/versions`,
    );
    supportedFixture.initialVersionCount = versions.json?.items.length ?? 0;
    record(
      "supported/provenance",
      versions.status === 200 && (versions.json?.items?.length ?? 0) >= 1 ? "PASS" : "FAIL",
      versions.status === 200
        ? `Persisted answer ${answer.id} has ${versions.json?.items?.length ?? 0} version(s).`
        : `Version lookup failed: HTTP ${versions.status} ${versions.text}`,
    );
  } else {
    record("supported/evidence", "FAIL", `Supported generation failed: HTTP ${supportedGeneration.status} ${supportedGeneration.text}`);
    return;
  }

  const weakGeneration = await requestJson<{
    answer: unknown | null;
    generation: { status: string; evidenceState?: string };
    evidenceState?: string;
    reason?: string | null;
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${weakFixture.requirementId}/answer/generate`);
  record(
    "weak/evidence",
    weakGeneration.status === 200 &&
      weakGeneration.json?.answer === null &&
      weakGeneration.json.generation.status === "INSUFFICIENT_EVIDENCE" &&
      (weakGeneration.json.evidenceState ?? weakGeneration.json.generation.evidenceState) === "NO_EVIDENCE"
      ? "PASS"
      : "FAIL",
    weakGeneration.status === 200
      ? `Weak evidence was filtered. generation=${weakGeneration.json.generation.status}, evidenceState=${weakGeneration.json.evidenceState ?? weakGeneration.json.generation.evidenceState ?? "n/a"}.`
      : `Weak generation failed: HTTP ${weakGeneration.status} ${weakGeneration.text}`,
  );

  const partialGeneration = await requestJson<{
    answer: { id: string; answerText: string; status: string } | null;
    generation: { status: string };
    grounding?: { status: string };
    reason?: string | null;
    suggestedAction?: string | null;
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${partialFixture.requirementId}/answer/generate`);
  record(
    "partial/evidence",
    partialGeneration.status === 200 &&
      partialGeneration.json?.answer?.status === "IN_REVIEW" &&
      (partialGeneration.json.grounding?.status ?? "") === "PARTIALLY_SUPPORTED"
      ? "PASS"
      : "FAIL",
    partialGeneration.status === 200
      ? `Partial grounding produced answer status ${partialGeneration.json.answer?.status ?? "n/a"} with grounding ${partialGeneration.json.grounding?.status ?? "n/a"} and reason ${partialGeneration.json.reason ?? "n/a"}.`
      : `Partial generation failed: HTTP ${partialGeneration.status} ${partialGeneration.text}`,
  );

  const contradictionGeneration = await requestJson<{
    answer: { id: string; answerText: string; status: string } | null;
    generation: { status: string };
    grounding?: { status: string };
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${contradictionFixture.requirementId}/answer/generate`);
  if (contradictionGeneration.status >= 200 && contradictionGeneration.status < 300 && contradictionGeneration.json?.answer?.id) {
    const contradictionAnswerId = contradictionGeneration.json.answer.id;
    const patched = await requestJson<{ id: string; answerText: string; status: string }>(
      cookie,
      "PATCH",
      `/tenders/${tenderId}/answers/${contradictionAnswerId}`,
      {
        answerText: "We always certify PCI compliance.",
        source: "AI_GENERATED",
        confidence: 0.42,
        status: "GENERATED",
        metadata: { boundary: "contradictory", regenerated: false },
      },
    );
    const analysis = await requestJson<{
      answer: { id: string; status: string; answerText: string } | null;
      analysis: { readiness: string; contradictions: Array<{ claim: string; reason: string }> };
      evidence: Array<{ evidenceId: string }>;
    }>(cookie, "POST", `/tenders/${tenderId}/requirements/${contradictionFixture.requirementId}/answer/analyze`);

    record(
      "contradictory/evidence",
      patched.status >= 200 &&
        patched.status < 300 &&
        analysis.status === 200 &&
        analysis.json?.analysis.readiness === "NEEDS_REVIEW" &&
        (analysis.json?.analysis.contradictions?.length ?? 0) > 0
        ? "PASS"
        : "FAIL",
      analysis.status === 200
        ? `Analysis readiness=${analysis.json.analysis.readiness}, contradictions=${analysis.json.analysis.contradictions.length}.`
        : `Contradiction analysis failed: HTTP ${analysis.status} ${analysis.text}`,
    );
  } else {
    record(
      "contradictory/evidence",
      "FAIL",
      `Contradictory generation failed before analysis: HTTP ${contradictionGeneration.status} ${contradictionGeneration.text}`,
    );
  }

  const regenerationFirst = await requestJson<{
    answer: { id: string; answerText: string; status: string } | null;
    generation: { status: string };
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${regenerationFixture.requirementId}/answer/generate`);
  if (!(regenerationFirst.status >= 200 && regenerationFirst.status < 300 && regenerationFirst.json?.answer?.id)) {
    record("regeneration/versioning", "FAIL", `Initial regeneration seed failed: HTTP ${regenerationFirst.status} ${regenerationFirst.text}`);
    return;
  }
  const regenerationAnswerId = regenerationFirst.json.answer.id;
  const initialVersions = await requestJson<{ items: Array<{ versionNumber: number; content: string }> }>(
    cookie,
    "GET",
    `/tenders/${tenderId}/answers/${regenerationAnswerId}/versions`,
  );
  const initialVersionCount = initialVersions.json?.items.length ?? 0;

  const seededExtraEvidence = await db.insert(knowledgeSources).values({
    id: randomUUID(),
    organizationId: orgId,
    name: "Orion interoperability addendum live",
    type: "Policy",
    category: "Architecture",
    version: "2.0",
    authority: "high",
    ownerId: loginBody.user?.id,
    lastVerified: now,
    lastUpdated: now,
    expiresAt: isoDate(365),
    summary: "Orion interoperability addendum with extended integration detail.",
  }).returning();
  const extraSourceId = seededExtraEvidence[0]?.id;
  if (extraSourceId) {
    await db.insert(knowledgeClaims).values({
      sourceId: extraSourceId,
      label: "Orion addendum live",
      value: "Additional integration detail is available in the addendum.",
      confidence: "0.99",
    });
    await db.insert(knowledgeVersions).values({
      sourceId: extraSourceId,
      version: "2.0",
      date: now.slice(0, 10),
      note: "Extended interoperability addendum.",
    });
  }

  const regenerationSecond = await requestJson<{
    answer: { id: string; answerText: string; status: string } | null;
    generation: { status: string };
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${regenerationFixture.requirementId}/answer/generate`);
  const secondVersions = await requestJson<{ items: Array<{ versionNumber: number; content: string }> }>(
    cookie,
    "GET",
    `/tenders/${tenderId}/answers/${regenerationAnswerId}/versions`,
  );
  const versionNumbers = secondVersions.json?.items.map((item) => item.versionNumber) ?? [];
  record(
    "regeneration/versioning",
    regenerationSecond.status === 200 &&
      (secondVersions.json?.items.length ?? 0) > initialVersionCount &&
      versionNumbers.includes(1) &&
      versionNumbers.some((value) => value > 1)
      ? "PASS"
      : "FAIL",
    regenerationSecond.status === 200
      ? `Regeneration preserved v1 and added versions ${versionNumbers.join(", ")} for answer ${regenerationAnswerId}.`
      : `Regeneration failed: HTTP ${regenerationSecond.status} ${regenerationSecond.text}`,
  );

  const orgB = randomUUID();
  const userB = randomUUID();
  const workspaceB = randomUUID();
  const knowledgeB = randomUUID();
  await db.insert(organizations).values({
    id: orgB,
    name: `Isolation Org ${orgB.slice(0, 8)}`,
    domain: `isolation-${orgB.slice(0, 8)}.example`,
    plan: "Enterprise",
    seats: 5,
    industry: "Software",
    logoInitials: "IO",
  });
  await db.insert(users).values({
    id: userB,
    organizationId: orgB,
    name: "Isolation User",
    email: `isolation-${orgB.slice(0, 8)}@example.invalid`,
  });
  await db.insert(organizationMembers).values({
    organizationId: orgB,
    userId: userB,
    role: "OWNER",
    status: "active",
  });
  await db.insert(workspaces).values({
    id: workspaceB,
    organizationId: orgB,
    name: "Isolation Workspace",
    slug: `isolation-${orgB.slice(0, 8)}`,
    description: "Cross-org probe workspace.",
  });
  await db.insert(knowledgeSources).values({
    id: knowledgeB,
    organizationId: orgB,
    name: "Isolation Knowledge Source",
    type: "Policy",
    category: "Security",
    version: "1.0",
    authority: "high",
    ownerId: userB,
    lastVerified: now,
    lastUpdated: now,
    expiresAt: isoDate(365),
    summary: "Cross-org probe only.",
  });
  await db.insert(knowledgeClaims).values({
    sourceId: knowledgeB,
    label: "Isolation",
    value: "Tenant B only.",
    confidence: "0.99",
  });
  await db.insert(knowledgeVersions).values({
    sourceId: knowledgeB,
    version: "1.0",
    date: now.slice(0, 10),
    note: "Probe version.",
  });
  await db.insert(tenders).values({
    id: randomUUID(),
    organizationId: orgB,
    workspaceId: workspaceB,
    name: "Isolation Tender",
    title: "Isolation Tender",
    referenceNumber: `ISO-${orgB.slice(0, 8)}`,
    description: "Cross-org probe tender.",
    tenderType: "DOCUMENT",
    sourceType: "MANUAL",
    sourceReference: {},
    sourceUrl: null,
    status: "DRAFT",
    ownerId: userB,
    createdBy: userB,
    receivedAt: new Date(now),
    dueAt: new Date(isoDate(14)),
    timezone: "UTC",
    metadata: {},
  });
  const unauthorizedAttach = await requestJson(
    cookie,
    "POST",
    `/tenders/${tenderId}/answers/${supportedFixture.answerId}/evidence`,
    {
      evidenceType: "KNOWLEDGE",
      evidenceId: knowledgeB,
      sourceId: knowledgeB,
      relevance: 0.95,
      confidence: 0.95,
      freshness: "FRESH",
      verifiedAt: now,
      metadata: { boundary: "unauthorized", sourceOrg: orgB },
    },
  );
  record(
    "unauthorized/evidence",
    unauthorizedAttach.status >= 400 && unauthorizedAttach.status < 500 ? "PASS" : "FAIL",
    unauthorizedAttach.status >= 400 && unauthorizedAttach.status < 500
      ? `Cross-org evidence was rejected with HTTP ${unauthorizedAttach.status}.`
      : `Expected cross-org rejection but got HTTP ${unauthorizedAttach.status}: ${unauthorizedAttach.text}`,
  );

  const reload = await requestJson<{ id: string; status: string }>(cookie, "GET", `/tenders/${tenderId}`);
  record(
    "reload/persistence",
    reload.status === 200 ? "PASS" : "FAIL",
    reload.status === 200 ? `Reloaded tender ${reload.json?.id} with status ${reload.json?.status}.` : `Reload failed: HTTP ${reload.status} ${reload.text}`,
  );

  const summary = results.reduce<Record<BoundaryStatus, number>>(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { PASS: 0, FAIL: 0, BLOCKED: 0 },
  );

  console.log(
    JSON.stringify(
      {
        summary,
        tenderId,
        workspaceId,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
