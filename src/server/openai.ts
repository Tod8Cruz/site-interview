import "server-only";

/** 테스트용 목 서버를 가리킬 때만 OPENAI_BASE_URL을 바꾼다. */
export const OPENAI_BASE_URL = () => process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export const OPENAI_NOT_CONFIGURED_MESSAGE =
  "OpenAI API 키가 등록되지 않았습니다. 설정 > OpenAI API 키에서 등록해 주세요.";
