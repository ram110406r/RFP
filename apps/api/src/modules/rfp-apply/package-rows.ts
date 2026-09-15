import type { PackageAnswerRow } from "./submission-package";

export function projectPackageRows(
  requirements: Array<{ id: string; title: string; description: string; mandatory: boolean }>,
  questions: Array<{ id: string; questionText: string; required: boolean }>,
  answers: Array<{ id: string; questionId: string; answerText: string; status: string }>,
  links: Array<{ questionId: string; requirementId: string }>,
  evidence: Array<{ answerId: string; evidenceType: string; evidenceId: string }>,
): PackageAnswerRow[] {
  const rows = questions.map((question) => {
    const related = requirements.filter((requirement) => links.some((link) => link.questionId === question.id && link.requirementId === requirement.id));
    const answer = answers.find((item) => item.questionId === question.id);
    return {
      requirement: related.map((item) => item.title).join("; ") || "Standalone question",
      question: question.questionText,
      answer: answer?.answerText ?? "",
      mandatory: question.required || related.some((item) => item.mandatory),
      status: answer?.status ?? "UNANSWERED",
      evidence: evidence.filter((item) => item.answerId === answer?.id).map((item) => `${item.evidenceType}:${item.evidenceId}`),
    };
  });
  for (const requirement of requirements) {
    if (links.some((link) => link.requirementId === requirement.id && questions.some((question) => question.id === link.questionId))) continue;
    rows.push({ requirement: requirement.title, question: requirement.description, answer: "", mandatory: requirement.mandatory, status: "UNANSWERED", evidence: [] });
  }
  return rows;
}
