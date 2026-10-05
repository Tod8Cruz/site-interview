import type { VOICES } from "@/lib/validation";

type Voice = (typeof VOICES)[number];

// OpenAI는 목소리별 성격·성별을 공식 제공하지 않는다. 아래는 외부 문서를 번역한 참고용이다.
// - 성격: Mastra OpenAI Realtime 문서(alloy~verse), Handy AI "Model Drop: GPT-Realtime-2"(marin, cedar)
// - 성별: omnivoice-server의 OpenAI 호환 프리셋
// - 추천: OpenAI TTS 가이드 "For best quality, we recommend using marin or cedar."
export const VOICE_PROFILES: Record<Voice, { gender: "female" | "male"; trait: string; recommended?: boolean }> = {
  marin: { gender: "female", trait: "밝은", recommended: true },
  alloy: { gender: "female", trait: "중립적이고 균형 잡힌" },
  coral: { gender: "female", trait: "따뜻하고 친근한" },
  sage: { gender: "female", trait: "차분하고 사려 깊은" },
  shimmer: { gender: "female", trait: "밝고 활기찬" },
  cedar: { gender: "male", trait: "따뜻한 중음역", recommended: true },
  ash: { gender: "male", trait: "또렷하고 정확한" },
  ballad: { gender: "male", trait: "선율감 있고 부드러운" },
  echo: { gender: "male", trait: "울림 있고 깊은" },
  verse: { gender: "male", trait: "다재다능하고 표현력 있는" },
};

export const VOICE_GROUPS = [
  { label: "여성", gender: "female" },
  { label: "남성", gender: "male" },
] as const;
