import { expect, test } from "bun:test";
import { projectPackageRows } from "./package-rows";

test("exports all linked and standalone questions, plus unlinked requirements", () => {
  const requirements = ["r1", "r2"].map((id) => ({ id, title: id, description: id, mandatory: true }));
  const questions = ["q1", "q2", "q3"].map((id) => ({ id, questionText: id, required: true }));
  const answers = questions.map((q) => ({ id: `a-${q.id}`, questionId: q.id, answerText: `answer ${q.id}`, status: "FINAL" }));
  const rows = projectPackageRows(requirements, questions, answers, [{ requirementId: "r1", questionId: "q1" }, { requirementId: "r1", questionId: "q2" }], []);
  expect(rows.map((row) => row.question)).toEqual(["q1", "q2", "q3", "r2"]);
  expect(rows.slice(0, 3).map((row) => row.answer)).toEqual(["answer q1", "answer q2", "answer q3"]);
  expect(rows[3]!.status).toBe("UNANSWERED");
});
