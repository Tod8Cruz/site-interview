import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interviewEvaluations } from "@/db/schema";
import {
  buildEvaluationPrompt,
  evaluationJsonSchema,
  evaluationOutputSchema,
  groupAnswers,
  normalizeEvaluation,
} from "@/lib/evaluation";
import { evaluationRunSchema } from "@/lib/validation";
import { BadRequestError } from "./http";
import { getInterview, getInterviewTurns, NotFoundError } from "./interviews";
import { createStructuredResponse, OpenAIError } from "./openai";
import { getQuestionsByIds } from "./questions";
import { getDefaultRubric, getRubric } from "./rubrics";

export const EVAL_MODEL = () => process.env.OPENAI_EVAL_MODEL || "gpt-4.1-mini";

/** 호출자가 면접 주인을 확인한다. */
export async function getEvaluation(interviewId: string) {
  const [row] = await db.select().from(interviewEvaluations).where(eq(interviewEvaluations.interviewId, interviewId));
  return row ?? null;
}

export async function deleteEvaluation(interviewId: string) {
  const [row] = await db
    .delete(interviewEvaluations)
    .where(eq(interviewEvaluations.interviewId, interviewId))
    .returning({ id: interviewEvaluations.id });
  return Boolean(row);
}

/**
 * 끝난 면접의 대화 기록을 루브릭으로 평가해 저장한다(이미 있으면 덮어쓴다).
 * API 키(이 사용자의 키)는 라우트가 없을 때 503으로 처리한 뒤 넘긴다. 실패하면 아무것도 쓰지 않는다.
 */
export async function runEvaluation(userId: string, interviewId: string, input: unknown, apiKey: string) {
  const { rubricId } = evaluationRunSchema.parse(input);
  const interview = await getInterview(userId, interviewId);
  if (!interview) throw new NotFoundError("면접을 찾을 수 없습니다.");
  if (interview.status !== "completed" && interview.status !== "aborted") {
    throw new BadRequestError("면접을 마친 뒤에 평가할 수 있습니다.");
  }
  const [turns, questions, rubric] = await Promise.all([
    getInterviewTurns(interviewId),
    getQuestionsByIds(userId, interview.questionIds),
    rubricId ? getRubric(userId, rubricId) : getDefaultRubric(userId),
  ]);
  if (!rubric) throw new NotFoundError("평가 기준을 찾을 수 없습니다.");

  const groups = groupAnswers(turns, questions);
  if (!groups.length) throw new BadRequestError("평가할 지원자 답변이 없습니다.");

  const { instructions, input: promptInput } = buildEvaluationPrompt({
    criteria: rubric.criteria,
    groups,
    questions,
    context: interview.context,
  });
  const model = EVAL_MODEL();
  const raw = await createStructuredResponse({
    apiKey,
    model,
    instructions,
    input: promptInput,
    schemaName: "interview_evaluation",
    schema: evaluationJsonSchema(
      rubric.criteria.map((c) => c.id),
      groups.map((g) => g.key),
    ),
  });
  const parsed = evaluationOutputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("평가 결과 형식 오류", parsed.error.issues);
    throw new OpenAIError("평가 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.");
  }
  let result;
  try {
    result = normalizeEvaluation(parsed.data, rubric.criteria, groups);
  } catch (error) {
    throw new OpenAIError(`평가 결과가 불완전합니다: ${(error as Error).message}`);
  }

  const values = { rubricId: rubric.id, rubricName: rubric.name, criteria: rubric.criteria, model, result };
  const [row] = await db
    .insert(interviewEvaluations)
    .values({ ...values, interviewId })
    .onConflictDoUpdate({ target: interviewEvaluations.interviewId, set: { ...values, updatedAt: new Date() } })
    .returning();
  return row;
}
