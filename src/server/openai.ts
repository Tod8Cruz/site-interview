import "server-only";

/** 테스트용 목 서버를 가리킬 때만 OPENAI_BASE_URL을 바꾼다. */
export const OPENAI_BASE_URL = () => process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export const OPENAI_NOT_CONFIGURED_MESSAGE =
  "OpenAI API 키가 등록되지 않았습니다. 설정 > OpenAI API 키에서 등록해 주세요.";

/** OpenAI 호출 실패(HTTP 오류·시간 초과·거부·형식 불일치). 라우트에서 502로 바꾼다. */
export class OpenAIError extends Error {}

type StructuredResponseOptions = {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
};

type ResponsesOutput = {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
};

/**
 * Responses API로 JSON 스키마에 고정된 출력을 받는다. 돌려주는 값은 JSON.parse 결과이고 검증은 호출자가 한다.
 * temperature는 보내지 않는다(모델에 따라 거부하므로 OPENAI_EVAL_MODEL을 바꿔도 동작하게).
 */
export async function createStructuredResponse(options: StructuredResponseOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL()}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        instructions: options.instructions,
        input: options.input,
        store: false,
        max_output_tokens: 16000,
        text: { format: { type: "json_schema", name: options.schemaName, strict: true, schema: options.schema } },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 110_000),
    });
  } catch (error) {
    console.error("OpenAI responses 요청 실패", error);
    throw new OpenAIError("OpenAI 응답이 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!response.ok) {
    console.error("OpenAI responses 오류", response.status, await response.text().catch(() => ""));
    if (response.status === 401) throw new OpenAIError("OpenAI가 API 키를 거부했습니다. 설정에서 키를 확인해 주세요.");
    throw new OpenAIError(`OpenAI 평가 요청에 실패했습니다 (${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as ResponsesOutput | null;
  if (!body) throw new OpenAIError("OpenAI 응답을 읽지 못했습니다.");
  if (body.status === "incomplete") {
    throw new OpenAIError(
      body.incomplete_details?.reason === "max_output_tokens"
        ? "평가 결과가 너무 길어 잘렸습니다. 평가 항목 수를 줄여 다시 시도해 주세요."
        : "OpenAI가 평가를 끝내지 못했습니다. 다시 시도해 주세요.",
    );
  }
  const message = body.output?.find((item) => item.type === "message");
  const refusal = message?.content?.find((c) => c.type === "refusal");
  if (refusal) throw new OpenAIError(`OpenAI가 평가를 거부했습니다: ${refusal.refusal ?? ""}`);
  const text = message?.content?.find((c) => c.type === "output_text")?.text;
  if (!text) throw new OpenAIError("OpenAI 응답에 평가 결과가 없습니다.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OpenAIError("OpenAI 응답이 올바른 JSON이 아닙니다.");
  }
}
