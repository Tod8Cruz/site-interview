import { VOICE_GROUPS, VOICE_PROFILES } from "@/lib/voices";

// 목소리 <select> 안에 넣는 성별 그룹별 옵션. 예: "marin — 밝은 (추천)"
export function VoiceOptions() {
  const entries = Object.entries(VOICE_PROFILES);
  return VOICE_GROUPS.map((group) => (
    <optgroup key={group.gender} label={group.label}>
      {entries.filter(([, p]) => p.gender === group.gender).map(([voice, p]) => (
        <option key={voice} value={voice}>
          {voice} — {p.trait}{p.recommended ? " (추천)" : ""}
        </option>
      ))}
    </optgroup>
  ));
}
