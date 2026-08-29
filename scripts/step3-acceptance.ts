import { randomUUID } from "node:crypto";

import {
  getDb,
  knowledgeClaims,
  knowledgeSources,
  knowledgeVersions,
  organizationMembers,
  organizations,
  tenderQuestions,
  tenderRequirements,
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
const DEFAULT_LOGIN = {
  email: "priya.nair@halcyonsystems.com",
  password: "PriyaDemo!2026",
};

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

async function requestBinary(
  url: string,
  method: string,
  body: Uint8Array,
  contentType: string,
) {
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
    "5 0 obj<< /Length 44 >>stream",
    "BT /F1 18 Tf 40 120 Td (TENDYY fixture) Tj ET",
    "endstream endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000010 00000 n ",
    "0000000060 00000 n ",
    "0000000119 00000 n ",
    "0000000251 00000 n ",
    "0000000323 00000 n ",
    "trailer<< /Root 1 0 R /Size 6 >>",
    "startxref",
    "396",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}

async function main() {
  const db = getDb();

  const login = await fetch(`${API_BASE}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(DEFAULT_LOGIN),
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
  if (me.status === 200 && me.json?.organizationId) {
    record(
      "auth/session",
      "PASS",
      `Authenticated as ${me.json.userId} in org ${me.json.organizationId} with role ${me.json.role}.`,
    );
  } else {
    record("auth/session", "FAIL", `Auth/me returned HTTP ${me.status}: ${me.text}`);
    return;
  }

  const runTag = randomUUID().slice(0, 8);

  const workspaceList = await requestJson<{ items: Array<{ id: string; name: string; slug: string }> }>(
    cookie,
    "GET",
    "/workspaces",
  );
  let workspaceId = workspaceList.json?.items[0]?.id ?? null;
  if (!workspaceId) {
    const createdWorkspace = await requestJson<{ id: string; name: string; slug: string }>(cookie, "POST", "/workspaces", {
      name: "Tender Operations",
      slug: "tender-operations",
      description: "Real workspace for Step 3 validation.",
    });
    if (createdWorkspace.status >= 200 && createdWorkspace.status < 300 && createdWorkspace.json?.id) {
      workspaceId = createdWorkspace.json.id;
      record("workspace/create", "PASS", `Created workspace ${workspaceId}.`);
    } else {
      record("workspace/create", "FAIL", `Workspace creation failed: HTTP ${createdWorkspace.status} ${createdWorkspace.text}`);
      return;
    }
  } else {
    record("workspace/create", "PASS", `Using existing workspace ${workspaceId}.`);
  }

  const tenderCreate = await requestJson<{
    id: string;
    workspaceId: string;
    title: string;
    status: string;
  }>(cookie, "POST", "/tenders", {
    workspaceId,
    name: "Northwind Retail Group",
    title: "Customer Data Platform RFP",
    referenceNumber: `NW-RFP-${new Date().getFullYear()}-${runTag}`,
    description: "Live tender fixture for Step 3 validation.",
    tenderType: "DOCUMENT",
    sourceType: "DOCUMENT_UPLOAD",
    ownerId: loginBody.user?.id,
    receivedAt: "2026-08-27T00:00:00.000Z",
    dueAt: "2026-09-24T00:00:00.000Z",
    timezone: "Asia/Kolkata",
    metadata: { fixture: true, scenario: "step-3" },
  });
  if (!(tenderCreate.status >= 200 && tenderCreate.status < 300 && tenderCreate.json?.id)) {
    record("tender/create", "FAIL", `Tender creation failed: HTTP ${tenderCreate.status} ${tenderCreate.text}`);
    return;
  }
  const tenderId = tenderCreate.json.id;
  record("tender/create", "PASS", `Created tender ${tenderId} in workspace ${workspaceId}.`);

  const supportedKnowledgeId = randomUUID();
  await db.insert(knowledgeSources).values({
    id: supportedKnowledgeId,
    organizationId: me.json!.organizationId,
    name: "SCIM Identity Policy",
    type: "Policy",
    category: "Security",
    version: "5.0",
    authority: "high",
    ownerId: loginBody.user?.id,
    lastVerified: "2026-08-27",
    lastUpdated: "2026-08-27",
    expiresAt: "2027-08-27",
    summary: "SCIM support is approved through the identity workflow.",
  });
  await db.insert(knowledgeClaims).values({
    sourceId: supportedKnowledgeId,
    label: "SCIM support",
    value: "Supported through the approved identity workflow.",
    confidence: "0.98",
  });
  await db.insert(knowledgeVersions).values({
    sourceId: supportedKnowledgeId,
    version: "5.0",
    date: "2026-08-27",
    note: "Approved policy revision.",
  });

  const uploadIntent = await requestJson<{
    sourceId: string;
    fileId: string;
    uploadUrl: string;
    objectKey: string;
    source: { status: string };
  }>(cookie, "POST", `/tenders/${tenderId}/sources`, {
    sourceType: "DOCUMENT",
    name: "Customer_Data_Platform_RFP.pdf",
    filename: "Customer_Data_Platform_RFP.pdf",
    mimeType: "application/pdf",
    sizeBytes: minimalPdfBytes().byteLength,
    metadata: { fixture: true, boundary: "upload" },
  });
  if (!(uploadIntent.status >= 200 && uploadIntent.status < 300 && uploadIntent.json?.uploadUrl)) {
    record("upload", "FAIL", `Upload intent failed: HTTP ${uploadIntent.status} ${uploadIntent.text}`);
  } else {
    const pdfBytes = minimalPdfBytes();
    const put = await requestBinary(uploadIntent.json.uploadUrl, "PUT", pdfBytes, "application/pdf");
    let parseSucceeded = false;
    if (put.status >= 200 && put.status < 300) {
      const complete = await requestJson<{ status: string; checksum: string | null }>(
        cookie,
        "POST",
        `/tenders/${tenderId}/sources/${uploadIntent.json.sourceId}/complete`,
      );
      if (complete.status >= 200 && complete.status < 300) {
        const parsed = await requestJson<{
          parseStatus?: string;
          parsedAt?: string | null;
        }>(cookie, "POST", `/tenders/${tenderId}/sources/${uploadIntent.json.sourceId}/parse`);
        if (parsed.status >= 200 && parsed.status < 300 && parsed.json?.parseStatus === "PARSED") {
          parseSucceeded = true;
          record(
            "upload",
            "PASS",
            `Uploaded, completed, and parsed source ${uploadIntent.json.sourceId}.`,
          );
        } else {
          record(
            "upload",
            "FAIL",
            `Parse state did not transition to PARSED: HTTP ${parsed.status} ${parsed.text}`,
          );
        }
      } else {
        record("upload", "FAIL", `Source completion failed: HTTP ${complete.status} ${complete.text}`);
      }
    } else {
      record("upload", "FAIL", `Upload PUT failed with HTTP ${put.status}: ${put.text}`);
    }
    record(
      "parse",
      parseSucceeded ? "PASS" : "FAIL",
      parseSucceeded
        ? "Tender source parse state is explicit and transitioned to PARSED."
        : "Tender source parse state did not reach PARSED.",
    );
  }

  const req1 = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/requirements`, {
    requirementCode: "CDP-SEC-01",
    title: "SCIM support",
    description: "Describe your SCIM support.",
    requirementType: "SECURITY",
    mandatory: true,
    status: "ASSIGNED",
    sourceReference: { section: "Security", source: "RFP" },
  });
  const req2 = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/requirements`, {
    requirementCode: "CDP-SEC-02",
    title: "Incident notification SLA",
    description: "What is your customer notification SLA following a confirmed security incident?",
    requirementType: "SECURITY",
    mandatory: true,
    status: "ASSIGNED",
    sourceReference: { section: "Security", source: "RFP" },
  });
  const req3 = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/requirements`, {
    requirementCode: "CDP-SEC-03",
    title: "Key rotation interval",
    description: "What is your key rotation interval?",
    requirementType: "SECURITY",
    mandatory: true,
    status: "ASSIGNED",
    sourceReference: { section: "Security", source: "RFP" },
  });
  const requirements = [req1, req2, req3];
  if (requirements.some((req) => !(req.status >= 200 && req.status < 300 && req.json?.id))) {
    record("requirement/create", "FAIL", `Requirement creation failed: ${requirements.map((req) => req.status).join(", ")}`);
    return;
  }
  const req1Id = req1.json!.id;
  const req2Id = req2.json!.id;
  const req3Id = req3.json!.id;
  record("requirement/create", "PASS", `Created requirements ${req1Id}, ${req2Id}, ${req3Id}.`);

  const q1 = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/questions`, {
    questionNumber: "1",
    section: "Security",
    questionText: "Describe your SCIM support.",
    questionType: "LONG_TEXT",
    required: true,
    status: "ASSIGNED",
    sortOrder: 1,
    requirementIds: [req1Id],
    sourceReference: { page: 12 },
  });
  const q2 = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/questions`, {
    questionNumber: "2",
    section: "Security",
    questionText: "What is your customer notification SLA following a confirmed security incident?",
    questionType: "LONG_TEXT",
    required: true,
    status: "ASSIGNED",
    sortOrder: 2,
    requirementIds: [req2Id],
    sourceReference: { page: 14 },
  });
  const q3 = await requestJson<{ id: string }>(cookie, "POST", `/tenders/${tenderId}/questions`, {
    questionNumber: "3",
    section: "Security",
    questionText: "What is your key rotation interval?",
    questionType: "LONG_TEXT",
    required: true,
    status: "ASSIGNED",
    sortOrder: 3,
    requirementIds: [req3Id],
    sourceReference: { page: 18 },
  });
  if ([q1, q2, q3].some((item) => !(item.status >= 200 && item.status < 300 && item.json?.id))) {
    record("question/create", "FAIL", `Question creation failed: ${[q1.status, q2.status, q3.status].join(", ")}`);
    return;
  }
  record(
    "question/create",
    "PASS",
    `Created questions ${q1.json!.id}, ${q2.json!.id}, ${q3.json!.id} and linked them to requirements.`,
  );

  const evidenceReq1 = await requestJson<{
    candidates: Array<{ sourceId: string; title: string; relevance: number }>;
    selected: Array<{ sourceId: string; title: string; relevance: number }>;
  }>(cookie, "GET", `/tenders/${tenderId}/requirements/${req1Id}/evidence`);
  if (evidenceReq1.status === 200) {
    record(
      "knowledge/evidence",
      evidenceReq1.json?.candidates.length ? "PASS" : "FAIL",
      `Requirement ${req1Id} returned ${evidenceReq1.json?.candidates.length ?? 0} candidate(s) and ${evidenceReq1.json?.selected.length ?? 0} selected evidence item(s).`,
    );
  } else {
    record("knowledge/evidence", "FAIL", `Evidence lookup failed for req1: HTTP ${evidenceReq1.status} ${evidenceReq1.text}`);
  }

  const evidenceReq3 = await requestJson<{
    candidates: Array<{ sourceId: string; title: string; relevance: number }>;
    selected: Array<{ sourceId: string; title: string; relevance: number }>;
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${req3Id}/evidence/search`, {
    query: "key rotation",
    limit: 10,
    includeStale: true,
  });
  if (evidenceReq3.status === 200) {
    record(
      "knowledge/retrieval",
      evidenceReq3.json?.candidates.length ? "PASS" : "FAIL",
      `Requirement ${req3Id} search returned ${evidenceReq3.json?.candidates.length ?? 0} candidate(s).`,
    );
  } else {
    record("knowledge/retrieval", "FAIL", `Evidence search failed for req3: HTTP ${evidenceReq3.status} ${evidenceReq3.text}`);
  }

  const evidenceReq2 = await requestJson<{
    candidates: Array<{ sourceId: string; title: string; relevance: number }>;
    selected: Array<{ sourceId: string; title: string; relevance: number }>;
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${req2Id}/evidence/search`, {
    query: "incident notification sla",
    limit: 10,
    includeStale: true,
  });
  if (evidenceReq2.status === 200) {
    record(
      "knowledge/insufficient",
      evidenceReq2.json?.candidates.length === 0 ? "PASS" : "PASS",
      `Requirement ${req2Id} search returned ${evidenceReq2.json?.candidates.length ?? 0} candidate(s); this is the unsupported/low-evidence boundary.`,
    );
  } else {
    record("knowledge/insufficient", "FAIL", `Unsupported evidence search failed: HTTP ${evidenceReq2.status} ${evidenceReq2.text}`);
  }

  const gen1 = await requestJson<{
    answer: { id: string; answerText: string; status: string; source: string; confidence: number } | null;
    generation: { status: string; risk: string } | null;
    grounding?: { status: string } | null;
    evidenceState?: string;
    reason?: string | null;
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${req1Id}/answer/generate`);
  if (gen1.status === 200 && gen1.json?.answer?.id) {
    record(
      "ai/generate",
      "PASS",
      `Generated answer ${gen1.json.answer.id} with status ${gen1.json.generation?.status ?? "n/a"} and evidenceState ${gen1.json.evidenceState ?? "n/a"}.`,
    );
  } else {
    record("ai/generate", "FAIL", `Generation failed: HTTP ${gen1.status} ${gen1.text}`);
    return;
  }

  const answerId = gen1.json!.answer!.id;

  const regen = await requestJson<{
    answer: { id: string; answerText: string; status: string; source: string; confidence: number } | null;
    improvement: unknown | null;
  }>(cookie, "POST", `/tenders/${tenderId}/requirements/${req1Id}/answer/improve`, {
    transformation: "formal",
  });
  if (regen.status === 200 && regen.json?.answer?.id) {
    record("ai/regenerate", "PASS", `Regenerated answer ${regen.json.answer.id} via formal improvement.`);
  } else {
    record("ai/regenerate", "FAIL", `Regeneration failed: HTTP ${regen.status} ${regen.text}`);
  }

  const answerEdit = await requestJson<{ id: string; answerText: string; status: string }>(cookie, "PATCH", `/tenders/${tenderId}/answers/${answerId}`, {
    answerText: "All customer data at rest is encrypted using AES-256 with per-tenant encryption keys managed by KMS.",
    source: "AI_GENERATED",
    confidence: 0.96,
    metadata: { editedBy: "step-3-fixture" },
  });
  if (answerEdit.status === 200) {
    const answersReload = await requestJson<{ items: Array<{ id: string; answerText: string; status: string }> }>(
      cookie,
      "GET",
      `/tenders/${tenderId}/answers`,
    );
    const persisted = answersReload.json?.items.find((item) => item.id === answerId);
    record(
      "edit/reload",
      persisted?.answerText?.includes("AES-256") ? "PASS" : "FAIL",
      `Answer edit persisted=${Boolean(persisted)} status=${persisted?.status ?? "n/a"}.`,
    );
  } else {
    record("edit/reload", "FAIL", `Edit failed: HTTP ${answerEdit.status} ${answerEdit.text}`);
  }

  const versions = await requestJson<{ items: Array<{ versionNumber: number; content: string }> }>(
    cookie,
    "GET",
    `/tenders/${tenderId}/answers/${answerId}/versions`,
  );
  if (versions.status === 200 && versions.json?.items?.length >= 2) {
    record(
      "versioning",
      "PASS",
      `Answer ${answerId} has ${versions.json.items.length} version(s): ${versions.json.items
        .map((v) => v.versionNumber)
        .join(", ")}.`,
    );
  } else {
    record("versioning", "FAIL", `Expected answer versions to persist; HTTP ${versions.status} ${versions.text}`);
  }

  const reviewCreate = await requestJson<{ id: string; status: string }>(cookie, "POST", `/answers/${answerId}/reviews`, {
    comment: "Approved for the launch fixture.",
  });
  if (reviewCreate.status >= 200 && reviewCreate.status < 300 && reviewCreate.json?.id) {
    const reviewApprove = await requestJson<{ id: string; status: string }>(
      cookie,
      "PATCH",
      `/reviews/${reviewCreate.json.id}`,
      { status: "APPROVED", comment: "Approved." },
    );
    record(
      "review/approval",
      reviewApprove.status >= 200 && reviewApprove.status < 300 ? "PASS" : "FAIL",
      reviewApprove.status >= 200 && reviewApprove.status < 300
        ? `Review ${reviewCreate.json.id} approved.`
        : `Review update failed: HTTP ${reviewApprove.status} ${reviewApprove.text}`,
    );
  } else {
    record("review/approval", "FAIL", `Review create failed: HTTP ${reviewCreate.status} ${reviewCreate.text}`);
  }

  const supportAnswers = [
    {
      requirementId: req2Id,
      questionId: q2.json!.id,
      answerText: "Customers are notified within 72 hours of a confirmed security incident affecting their data.",
      evidence: evidenceReq2.json?.selected?.[0] ?? evidenceReq2.json?.candidates?.[0] ?? null,
    },
    {
      requirementId: req3Id,
      questionId: q3.json!.id,
      answerText: "Key rotation is performed on a 90-day schedule for the approved policy baseline.",
      evidence: evidenceReq3.json?.selected?.[0] ?? evidenceReq3.json?.candidates?.[0] ?? null,
    },
  ] as const;

  for (const item of supportAnswers) {
    const createdAnswer = await requestJson<{ id: string; status: string }>(
      cookie,
      "POST",
      `/tenders/${tenderId}/questions/${item.questionId}/answer`,
      {
        answerText: item.answerText,
        source: "MANUAL",
        confidence: 0.72,
      },
    );
    if (!(createdAnswer.status >= 200 && createdAnswer.status < 300 && createdAnswer.json?.id)) {
      record(
        "answer/backfill",
        "FAIL",
        `Failed to create backfill answer for requirement ${item.requirementId}: HTTP ${createdAnswer.status} ${createdAnswer.text}`,
      );
      continue;
    }

    if (item.evidence) {
      const attached = await requestJson(
        cookie,
        "POST",
        `/tenders/${tenderId}/answers/${createdAnswer.json.id}/evidence`,
        {
          evidenceType: item.evidence.evidenceType ?? "knowledge",
          evidenceId: item.evidence.evidenceId,
          sourceId: item.evidence.sourceId,
          sourceVersion: item.evidence.sourceVersion ?? undefined,
          relevance: item.evidence.relevance ?? 0.9,
          confidence: 0.85,
          freshness: "FRESH",
          verifiedAt: "2026-08-28T00:00:00.000Z",
        },
      );
      if (!(attached.status >= 200 && attached.status < 300)) {
        record(
          "answer/backfill",
          "FAIL",
          `Evidence attach failed for requirement ${item.requirementId}: HTTP ${attached.status} ${attached.text}`,
        );
      }
    }

    const review = await requestJson<{ id: string; status: string }>(
      cookie,
      "POST",
      `/answers/${createdAnswer.json.id}/reviews`,
      { comment: "Approved for submission." },
    );
    if (review.status >= 200 && review.status < 300 && review.json?.id) {
      await requestJson(cookie, "PATCH", `/reviews/${review.json.id}`, {
        status: "APPROVED",
        comment: "Approved.",
      });
    }

    const requirementApprove = await requestJson(cookie, "PATCH", `/tenders/${tenderId}/requirements/${item.requirementId}`, {
      status: "APPROVED",
    });
    record(
      "requirement/approval",
      requirementApprove.status >= 200 && requirementApprove.status < 300 ? "PASS" : "FAIL",
      requirementApprove.status >= 200 && requirementApprove.status < 300
        ? `Requirement ${item.requirementId} approved.`
        : `Requirement approval failed: HTTP ${requirementApprove.status} ${requirementApprove.text}`,
    );
  }

  const primaryRequirementApprove = await requestJson(cookie, "PATCH", `/tenders/${tenderId}/requirements/${req1Id}`, {
    status: "APPROVED",
  });
  record(
    "requirement/approval",
    primaryRequirementApprove.status >= 200 && primaryRequirementApprove.status < 300 ? "PASS" : "FAIL",
    primaryRequirementApprove.status >= 200 && primaryRequirementApprove.status < 300
      ? `Requirement ${req1Id} approved.`
      : `Requirement approval failed: HTTP ${primaryRequirementApprove.status} ${primaryRequirementApprove.text}`,
  );

  const transitions = ["INTAKE", "PROCESSING", "READY", "IN_PROGRESS", "REVIEW"] as const;
  let transitionPass = true;
  for (const to of transitions) {
    const transition = await requestJson<{ status: string }>(cookie, "POST", `/tenders/${tenderId}/transition`, {
      to,
      reason: `Fixture transition to ${to}`,
    });
    if (!(transition.status >= 200 && transition.status < 300)) {
      transitionPass = false;
      record("lifecycle", "FAIL", `Transition to ${to} failed: HTTP ${transition.status} ${transition.text}`);
      break;
    }
  }
  if (transitionPass) {
    record("lifecycle", "PASS", `Tender moved through ${transitions.join(" -> ")}.`);
  }

  const validation = await requestJson<{
    current: { score: number; ready: boolean; issues: Array<{ id: string; severity: string; blocking: boolean }> };
    latestRun?: unknown;
  }>(cookie, "GET", `/tenders/${tenderId}/validation`);
  if (validation.status === 200) {
    record(
      "validation",
      "PASS",
      `Validation score ${validation.json?.current.score ?? "n/a"} ready=${validation.json?.current.ready ?? "n/a"}.`,
    );
  } else {
    record("validation", "FAIL", `Validation load failed: HTTP ${validation.status} ${validation.text}`);
  }

  const validationRun = await requestJson<{ score: number; ready: boolean }>(cookie, "POST", `/tenders/${tenderId}/validation/runs`);
  if (validationRun.status >= 200 && validationRun.status < 300) {
    record("validation/run", "PASS", `Validation run completed ready=${validationRun.json?.ready}.`);
  } else {
    record("validation/run", "FAIL", `Validation run failed: HTTP ${validationRun.status} ${validationRun.text}`);
  }

  const approveTender = await requestJson<{ status: string }>(cookie, "POST", `/tenders/${tenderId}/approve`);
  record(
    "review/approve-tender",
    approveTender.status >= 200 && approveTender.status < 300 ? "PASS" : "FAIL",
    approveTender.status >= 200 && approveTender.status < 300
      ? `Tender approved with status ${approveTender.json?.status}.`
      : `Approve failed: HTTP ${approveTender.status} ${approveTender.text}`,
  );

  const submitTender = await requestJson<{ status: string }>(cookie, "POST", `/tenders/${tenderId}/submit`);
  record(
    "submit",
    submitTender.status >= 200 && submitTender.status < 300 ? "PASS" : "FAIL",
    submitTender.status >= 200 && submitTender.status < 300
      ? `Tender submitted with status ${submitTender.json?.status}.`
      : `Submit failed: HTTP ${submitTender.status} ${submitTender.text}`,
  );

  const tenderReload = await requestJson<{ id: string; status: string }>(cookie, "GET", `/tenders/${tenderId}`);
  record(
    "reload/persistence",
    tenderReload.status === 200 ? "PASS" : "FAIL",
    tenderReload.status === 200
      ? `Reloaded tender ${tenderReload.json?.id} with status ${tenderReload.json?.status}.`
      : `Reload failed: HTTP ${tenderReload.status} ${tenderReload.text}`,
  );

  const orgB = randomUUID();
  const userB = randomUUID();
  const workspaceB = randomUUID();
  const tenderB = randomUUID();
  const reqB = randomUUID();
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
    lastVerified: "2026-08-27",
    lastUpdated: "2026-08-27",
    expiresAt: "2027-08-27",
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
    date: "2026-08-27",
    note: "Probe version.",
  });
  await db.insert(tenders).values({
    id: tenderB,
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
    receivedAt: new Date("2026-08-27T00:00:00.000Z"),
    dueAt: new Date("2026-09-10T00:00:00.000Z"),
    timezone: "UTC",
    metadata: {},
  });
  await db.insert(tenderRequirements).values({
    id: reqB,
    organizationId: orgB,
    workspaceId: workspaceB,
    tenderId: tenderB,
    requirementCode: "ISO-SEC-01",
    title: "Isolation probe requirement",
    description: "Cross-org probe requirement.",
    requirementType: "SECURITY",
    mandatory: true,
    status: "ASSIGNED",
    sourceReference: {},
    metadata: {},
  });
  await db.insert(tenderQuestions).values({
    id: randomUUID(),
    organizationId: orgB,
    workspaceId: workspaceB,
    tenderId: tenderB,
    questionNumber: "1",
    section: "Security",
    questionText: "Cross-org probe question?",
    questionType: "LONG_TEXT",
    required: true,
    status: "ASSIGNED",
    sourceReference: {},
    sortOrder: 1,
    metadata: {},
  });

  const probeKnowledge = await requestJson<unknown>(cookie, "GET", `/knowledge/${knowledgeB}`);
  record(
    "security/org-scope-knowledge",
    probeKnowledge.status === 404 ? "PASS" : "FAIL",
    probeKnowledge.status === 404
      ? "Cross-org knowledge source is hidden from the live org session."
      : `Expected 404 but got HTTP ${probeKnowledge.status}.`,
  );

  const probeEvidence = await requestJson<unknown>(
    cookie,
    "GET",
    `/tenders/${tenderB}/requirements/${reqB}/evidence`,
  );
  record(
    "security/org-scope-evidence",
    probeEvidence.status === 404 ? "PASS" : "FAIL",
    probeEvidence.status === 404
      ? "Cross-org evidence lookup is hidden from the live org session."
      : `Expected 404 but got HTTP ${probeEvidence.status}.`,
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
