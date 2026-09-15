import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import {
  closeDb, getDb, organizations, users, organizationMembers, workspaces, tenders,
  tenderQuestions, tenderRequirements, tenderQuestionRequirements, tenderAnswers,
  tenderAnswerReviews, tenderAutomationRuns, tenderSubmissionPackages, tenderMilestones,
  files, tenderDocuments, accessPolicies,
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";
import { PolicyService } from "../../common/auth";
import { AuditService } from "../../infrastructure/audit";
import { ActivityService } from "../../infrastructure/activity";
import { TendersService } from "../tenders/tenders.service";
import { ApplyAutomationService } from "./apply-automation.service";
import { ApplyRunnerService } from "./apply-runner.service";

// Explicit opt-in: this suite writes fixtures and requires a disposable, migrated database.
const suite = process.env.RFP_APPLY_INTEGRATION === "1" ? describe : describe.skip;
suite("Apply workflow database regression", () => {
  let db: ReturnType<typeof getDb>;
  const org = randomUUID(), user = randomUUID(), workspace = randomUUID();
  const auth: AuthContext = { organizationId: org, userId: user, role: "OWNER", organizationPermissions: permissionsForRole("OWNER"), permissions: permissionsForRole("OWNER"), sessionId: "test" };
  const objects = new Map<string, Uint8Array>();
  const storage = { bucket: "test", putObject: async ({ objectKey, bytes }: { objectKey: string; bytes: Uint8Array }) => { objects.set(objectKey, bytes); }, readObject: async (key: string) => objects.get(key) ?? null, presignGet: async ({ objectKey }: { objectKey: string }) => objectKey };
  let tenderService: TendersService;
  let apply: ApplyAutomationService;

  beforeAll(async () => {
    db = getDb();
    await db.insert(organizations).values({ id: org, name: "Apply regression", domain: `${org}.invalid` });
    await db.insert(users).values({ id: user, organizationId: org, name: "Reviewer", email: `${user}@example.invalid` });
    await db.insert(organizationMembers).values({ organizationId: org, userId: user, role: "OWNER", status: "active" });
    await db.insert(workspaces).values({ id: workspace, organizationId: org, name: "Apply", slug: workspace });
    tenderService = new TendersService(db, storage as never, new ConfigService({}) as never, new AuditService(db), new ActivityService(db), new PolicyService(db), { log() {}, warn() {} } as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    apply = new ApplyAutomationService(db, tenderService, { create: async () => ({}) } as never, storage as never, new AuditService(db), new ActivityService(db));
  });
  afterAll(async () => { await closeDb(); });

  async function rejects(operation: Promise<unknown>, message?: string) {
    const error = await operation.then(() => null, (cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    if (message) expect((error as Error).message).toContain(message);
  }
  async function fixture(questionCount = 1) {
    const id = randomUUID();
    await db.insert(tenders).values({ id, organizationId: org, workspaceId: workspace, ownerId: user, name: "Buyer", title: "Test tender", tenderType: "ONLINE", sourceType: "MANUAL", sourceUrl: "https://example.invalid/tender", status: "REVIEW", dueAt: new Date("2030-01-01") });
    const questions = await db.insert(tenderQuestions).values(Array.from({ length: questionCount }, (_, i) => ({ organizationId: org, workspaceId: workspace, tenderId: id, questionText: `Question ${i}`, required: true, sortOrder: i }))).returning();
    return { id, questions };
  }
  async function reviewedAnswer(tenderId: string, questionId: string) {
    const answer = await tenderService.createAnswer(auth, tenderId, questionId, { answerText: "Reviewed response", source: "MANUAL" } as never);
    await tenderService.createReview(auth, answer.id, { status: "APPROVED", comment: "Reviewed" } as never);
    return answer;
  }
  async function queueFixture() {
    const fixtureRow = await fixture();
    const [requirement] = await db.insert(tenderRequirements).values({ organizationId: org, workspaceId: workspace, tenderId: fixtureRow.id, requirementCode: "R1", title: "Requirement", description: "Requirement", mandatory: false }).returning();
    await db.insert(tenderQuestionRequirements).values({ organizationId: org, workspaceId: workspace, questionId: fixtureRow.questions[0]!.id, requirementId: requirement!.id });
    return fixtureRow;
  }
  function runner(service = apply) {
    return new ApplyRunnerService(db, { resolveAuthContext: async () => auth } as never, service);
  }

  test("generic lifecycle routes cannot approve or submit without the package workflow", async () => {
    const { id } = await fixture();
    const approvalError = await tenderService.transition(auth, id, { to: "APPROVED" } as never).then(() => null, (error) => error);
    expect(approvalError?.getResponse().code).toBe("PACKAGE_WORKFLOW_REQUIRED");
    await db.update(tenders).set({ status: "APPROVED" }).where(eq(tenders.id, id));
    const submissionError = await tenderService.transition(auth, id, { to: "SUBMITTED" } as never).then(() => null, (error) => error);
    expect(submissionError?.getResponse().code).toBe("PACKAGE_WORKFLOW_REQUIRED");
  });

  test("manual status cannot fabricate review; content edits and upserts revoke approval", async () => {
    const { id, questions } = await fixture();
    await rejects(tenderService.createAnswer(auth, id, questions[0]!.id, { answerText: "Bypass", status: "APPROVED" } as never), );
    const answer = await reviewedAnswer(id, questions[0]!.id);
    await rejects(tenderService.updateAnswer(auth, id, answer.id, { status: "APPROVED" }), );
    await rejects(tenderService.updateAnswer(auth, id, answer.id, { answerText: "Changed", status: "FINAL" }), );
    await tenderService.updateAnswer(auth, id, answer.id, { answerText: "Edited after approval" });
    const [edited] = await db.select().from(tenderAnswers).where(eq(tenderAnswers.id, answer.id));
    expect(edited!.status).toBe("DRAFT");
    expect((await tenderService.getValidation(auth, id)).current.ready).toBe(false);
    await tenderService.createReview(auth, answer.id, { status: "APPROVED", comment: "Again" } as never);
    await tenderService.createAnswer(auth, id, questions[0]!.id, { answerText: "Upsert replacement" } as never);
    expect((await tenderService.getValidation(auth, id)).current.ready).toBe(false);
  });

  test("comment-only edits cannot rebind an old review", async () => {
    const { id, questions } = await fixture();
    const answer = await reviewedAnswer(id, questions[0]!.id);
    await tenderService.updateAnswer(auth, id, answer.id, { answerText: "New content" });
    const [review] = await db.select().from(tenderAnswerReviews).where(eq(tenderAnswerReviews.answerId, answer.id));
    await tenderService.updateReview(auth, review!.id, { comment: "Note only" });
    const [current] = await db.select().from(tenderAnswerReviews).where(eq(tenderAnswerReviews.id, review!.id));
    expect(current!.contentDigest).toBeNull();
    expect(current!.status).toBe("PENDING");
  });

  test("FINAL answers, complete package projection, approval, and submission work together", async () => {
    const { id, questions } = await fixture(3);
    const [requirement] = await db.insert(tenderRequirements).values({ organizationId: org, workspaceId: workspace, tenderId: id, requirementCode: "R1", title: "Shared requirement", description: "Both questions", mandatory: false }).returning();
    await db.insert(tenderQuestionRequirements).values(questions.slice(0, 2).map((q) => ({ organizationId: org, workspaceId: workspace, questionId: q.id, requirementId: requirement!.id })));
    for (const question of questions) {
      const answer = await reviewedAnswer(id, question.id);
      await tenderService.updateAnswer(auth, id, answer.id, { status: "FINAL" });
    }
    const pkg = await apply.createPackage(auth, id);
    const zip = unzipSync(objects.get(await apply.packageDownload(auth, id, pkg.id).then((value) => value.url))!);
    const docx = unzipSync(zip["response.docx"]!);
    for (let i = 0; i < 3; i++) expect(strFromU8(docx["word/document.xml"]!)).toContain(`Question ${i}`);
    await apply.approvePackage(auth, id, pkg.id, { comment: "Ready" });
    const submission = await apply.createSubmission(auth, id, { packageId: pkg.id, portal: "Test portal", portalReference: randomUUID(), submittedAt: new Date().toISOString(), notes: "", receiptFileIds: [] });
    expect(submission.packageId).toBe(pkg.id);
    expect((await db.select().from(tenders).where(eq(tenders.id, id)))[0]!.status).toBe("SUBMITTED");
  });

  test("wrong lifecycle state cannot partially approve a package", async () => {
    const { id, questions } = await fixture();
    await reviewedAnswer(id, questions[0]!.id);
    const pkg = await apply.createPackage(auth, id);
    await db.update(tenders).set({ status: "DRAFT" }).where(eq(tenders.id, id));
    await rejects(apply.approvePackage(auth, id, pkg.id, { comment: "" }), "Move the tender");
    expect((await db.select().from(tenderSubmissionPackages).where(eq(tenderSubmissionPackages.id, pkg.id)))[0]!.status).toBe("READY");
  });

  test("edits invalidate packages and reject stale submission", async () => {
    const { id, questions } = await fixture();
    const answer = await reviewedAnswer(id, questions[0]!.id);
    const pkg = await apply.createPackage(auth, id);
    await apply.approvePackage(auth, id, pkg.id, { comment: "" });
    await tenderService.updateAnswer(auth, id, answer.id, { answerText: "Changed" });
    expect((await db.select().from(tenders).where(eq(tenders.id, id)))[0]!.status).toBe("REVIEW");
    await rejects(apply.createSubmission(auth, id, { packageId: pkg.id, portal: "Portal", portalReference: "stale", submittedAt: new Date().toISOString(), notes: "", receiptFileIds: [] }), );
  });

  test("Apply reads enforce resource policies and tenant scope", async () => {
    const { id } = await fixture();
    const [policy] = await db.insert(accessPolicies).values({ organizationId: org, name: "Deny Apply read", resource: "tender", action: "read", effect: "deny", status: "active", priority: 100 }).returning();
    try {
      await rejects(apply.listRequirementCandidates(auth, id), );
      await rejects(apply.packageDownload(auth, id, randomUUID()), );
    } finally { await db.delete(accessPolicies).where(eq(accessPolicies.id, policy!.id)); }
    await rejects(apply.listRuns({ ...auth, organizationId: randomUUID() }, id), );
  });

  test("missing attachment fails package creation", async () => {
    const { id } = await fixture();
    const [file] = await db.insert(files).values({ organizationId: org, bucket: "test", objectKey: randomUUID(), filename: "missing.pdf", mimeType: "application/pdf", sizeBytes: 1, uploadedBy: user }).returning();
    await db.insert(tenderDocuments).values({ organizationId: org, workspaceId: workspace, tenderId: id, documentId: file!.id, documentRole: "RESPONSE_DOCUMENT" });
    await rejects(apply.createPackage(auth, id), "Unable to read submission attachment");
    expect((await db.select().from(tenderSubmissionPackages).where(eq(tenderSubmissionPackages.tenderId, id)))[0]!.status).toBe("FAILED");
  });

  test("concurrent starts collapse and a completed idempotency key never reruns", async () => {
    const { id } = await queueFixture();
    const results = await Promise.all([apply.createRun(auth, id, { includePackage: false, idempotencyKey: "request-key-1" }), apply.createRun(auth, id, { includePackage: false, idempotencyKey: "request-key-2" })]);
    expect(results[0].id).toBe(results[1].id);
    await db.update(tenderAutomationRuns).set({ status: "SUCCEEDED" }).where(eq(tenderAutomationRuns.id, results[0].id));
    const existing = await apply.createRun(auth, id, results[0].configuration as never);
    expect(existing.status).toBe("SUCCEEDED");
    expect((await apply.listRuns(auth, id)).items[0]!.steps).toHaveLength(4);
  });

  test("a runner recovers expired work and two runners do not claim the same run", async () => {
    const { id } = await queueFixture();
    const queued = await apply.createRun(auth, id, { includePackage: false });
    await db.update(tenderAutomationRuns).set({ status: "RUNNING", leaseOwner: randomUUID(), leaseExpiresAt: new Date(0) }).where(eq(tenderAutomationRuns.id, queued.id));
    let executions = 0;
    const work = { executeRun: async (_auth: AuthContext, row: typeof tenderAutomationRuns.$inferSelect) => { executions++; await db.update(tenderAutomationRuns).set({ status: "SUCCEEDED" }).where(eq(tenderAutomationRuns.id, row.id)); } } as ApplyAutomationService;
    await Promise.all([runner(work).processNext(), runner(work).processNext()]);
    expect(executions).toBe(1);
  });

  test("cancellation during analysis prevents generation and preserves CANCELLED", async () => {
    const { id } = await queueFixture();
    const queued = await apply.createRun(auth, id, { includePackage: false });
    const original = tenderService.analyzeTender;
    tenderService.analyzeTender = async () => { await apply.cancelRun(auth, id, queued.id); return {} as never; };
    try { await runner().processNext(); } finally { tenderService.analyzeTender = original; }
    const row = await apply.getRun(auth, id, queued.id);
    expect(row.status).toBe("CANCELLED");
    expect(row.items).toHaveLength(0);
  });

  test("deadline edits recalculate existing milestones", async () => {
    const { id } = await fixture();
    await apply.listMilestones(auth, id);
    await tenderService.update(auth, id, { dueAt: "2030-02-01T00:00:00.000Z" });
    const [milestone] = await db.select().from(tenderMilestones).where(and(eq(tenderMilestones.tenderId, id), eq(tenderMilestones.kind, "SUBMISSION")));
    expect(milestone!.dueAt.toISOString()).toBe("2030-01-31T00:00:00.000Z");
  });

  test("generation cannot overwrite an answer edited after its initial snapshot", async () => {
    const { id, questions } = await fixture();
    const answer = await reviewedAnswer(id, questions[0]!.id);
    const [baseline] = await db.select().from(tenderAnswers).where(eq(tenderAnswers.id, answer.id));
    await tenderService.updateAnswer(auth, id, answer.id, { answerText: "Human correction" });
    await rejects(tenderService.createAnswer(auth, id, questions[0]!.id, { answerText: "Late generated text", source: "AI_GENERATED" } as never, async () => {}, baseline!), "changed during generation");
    expect((await db.select().from(tenderAnswers).where(eq(tenderAnswers.id, answer.id)))[0]!.answerText).toBe("Human correction");
  });

  test("an expired or cancelled lease cannot commit an answer", async () => {
    const { id, questions } = await queueFixture();
    const queued = await apply.createRun(auth, id, { includePackage: false });
    const [claimed] = await db.update(tenderAutomationRuns).set({ status: "RUNNING", leaseOwner: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60000) }).where(eq(tenderAutomationRuns.id, queued.id)).returning();
    await apply.cancelRun(auth, id, queued.id);
    await rejects(tenderService.createAnswer(auth, id, questions[0]!.id, { answerText: "Late generation" } as never, (tx) => apply.assertRunActive(claimed!, tx)), "cancelled");
    expect(await db.select().from(tenderAnswers).where(eq(tenderAnswers.tenderId, id))).toHaveLength(0);
  });

  test("interrupted package generation recovers and concurrent builders share one package", async () => {
    const { id, questions } = await fixture();
    await reviewedAnswer(id, questions[0]!.id);
    const pkg = await apply.createPackage(auth, id);
    await db.update(tenderSubmissionPackages).set({ status: "GENERATING", completedAt: null }).where(eq(tenderSubmissionPackages.id, pkg.id));
    const recovered = await Promise.all([apply.createPackage(auth, id), apply.createPackage(auth, id)]);
    expect(recovered.map((row) => row.id)).toEqual([pkg.id, pkg.id]);
    expect(recovered.every((row) => row.status === "READY")).toBe(true);
    expect(await db.select().from(tenderSubmissionPackages).where(eq(tenderSubmissionPackages.tenderId, id))).toHaveLength(1);
  });

  test("a stale transition cannot reopen a tender submitted concurrently", async () => {
    const { id, questions } = await fixture();
    await reviewedAnswer(id, questions[0]!.id);
    const pkg = await apply.createPackage(auth, id);
    await apply.approvePackage(auth, id, pkg.id, { comment: "" });
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const paused = new Promise<void>((resolve) => { reached = resolve; });
    const policy = (tenderService as unknown as { policy: PolicyService }).policy;
    const originalEvaluate = policy.evaluate.bind(policy);
    policy.evaluate = async (...args: Parameters<PolicyService["evaluate"]>) => { if (args[2] === "transition") { reached(); await gate; } return originalEvaluate(...args); };
    const moving = tenderService.transition(auth, id, { to: "REVIEW" } as never).then(() => null, (error) => error);
    try {
      await paused;
      await apply.createSubmission(auth, id, { packageId: pkg.id, portal: "Portal", portalReference: randomUUID(), submittedAt: new Date().toISOString(), notes: "", receiptFileIds: [] });
      release();
      expect((await moving)?.getResponse().code).toBe("TENDER_STATE_CHANGED");
      expect((await db.select().from(tenders).where(eq(tenders.id, id)))[0]!.status).toBe("SUBMITTED");
    } finally { release(); policy.evaluate = originalEvaluate; }
  });
});
