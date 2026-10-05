// 면접 시작 모달에서 고른 마이크·스피커. 장치 ID는 브라우저마다 달라서 이 브라우저에만 저장한다.
const STORAGE_KEY = "interview-audio-devices";

export type AudioDevicePrefs = { inputId: string; outputId: string };

/** 면접 녹음과 같은 처리(에코 제거 등)를 써야 테스트 소리가 실제와 같다. */
export const MIC_PROCESSING = { echoCancellation: true, noiseSuppression: true, autoGainControl: true } as const;

export function loadAudioDevices(): AudioDevicePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AudioDevicePrefs>;
    return { inputId: saved.inputId ?? "", outputId: saved.outputId ?? "" };
  } catch {
    return { inputId: "", outputId: "" };
  }
}

export function saveAudioDevices(prefs: AudioDevicePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 저장소를 못 쓰면 시스템 기본 장치로 진행한다.
  }
}

/** 고른 마이크를 연다. 그 장치가 사라졌으면 시스템 기본 마이크로 연다. */
export async function openMicrophone(inputId: string) {
  if (inputId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...MIC_PROCESSING, deviceId: { exact: inputId } } });
    } catch (error) {
      if (!(error instanceof DOMException) || !["OverconstrainedError", "NotFoundError"].includes(error.name)) throw error;
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: MIC_PROCESSING });
}

/** 고른 스피커로 소리를 낸다. 실패하면 기본 스피커로 그대로 재생된다. */
export async function routeToSpeaker(element: HTMLMediaElement, outputId: string) {
  if (!outputId || typeof element.setSinkId !== "function") return;
  await element.setSinkId(outputId).catch((error) => console.warn("스피커 지정 실패", error));
}
