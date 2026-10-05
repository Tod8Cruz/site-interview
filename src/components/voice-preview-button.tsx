"use client";

import { useEffect, useRef, useState } from "react";
import { loadAudioDevices, routeToSpeaker } from "@/lib/audio-devices";

// public/voice-samples/{voice}.mp3 — "안녕하세요. 지원자님. 참석해 주셔서 감사합니다" (gpt-4o-mini-tts로 생성)
export function VoicePreviewButton({ voice }: { voice: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // 목소리를 바꾸거나 화면을 벗어나면 재생 중인 샘플을 멈춘다.
  useEffect(() => () => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [voice]);

  function toggle() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(`/voice-samples/${voice}.mp3`);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    setPlaying(true);
    void routeToSpeaker(audio, loadAudioDevices().outputId).then(() => audio.play().catch(() => setPlaying(false)));
  }

  return (
    <button type="button" onClick={toggle} className="btn shrink-0 px-3"
      aria-label={playing ? "미리듣기 정지" : `${voice} 목소리 미리듣기`}
      title={playing ? "정지" : "미리듣기"}>
      {playing ? "■" : "▶"}
    </button>
  );
}
