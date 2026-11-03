import { NextResponse } from "next/server";
import { VOICES } from "@/lib/validation";
import { VOICE_PROFILES } from "@/lib/voices";
import { checkApiKey } from "@/server/http";

/** 프롬프트 voice 필드에 쓸 수 있는 목소리 목록. 성격·성별은 참고용(OpenAI 공식 정보가 아님). */
export async function GET(request: Request) {
  const { denied } = await checkApiKey(request);
  if (denied) return denied;
  const items = VOICES.map((id) => ({ id, ...VOICE_PROFILES[id], recommended: VOICE_PROFILES[id].recommended ?? false }));
  return NextResponse.json({ items });
}
