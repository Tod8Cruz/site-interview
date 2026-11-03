import { putChunk, putMeta, recordingKey } from "./chunk-store";

export const TIMESLICE_MS = 5000;

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/**
 * L-1: 마이크와 면접관 음성을 하나의 스트림으로 섞어 녹음한다.
 * 조각은 TIMESLICE마다 IndexedDB에 저장한다(L-9). 통화 구간 하나가 녹음 하나다.
 */
export class MixedRecorder {
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly key: string;
  private recorder: MediaRecorder | null = null;
  private seq = 0;
  private pendingWrites: Promise<void>[] = [];
  private readonly chunks: Blob[] = [];
  mimeType = "";

  constructor(
    private readonly context: AudioContext,
    private readonly interviewId: string,
    /** 누적 시계에서 이 구간이 시작하는 지점 (처음이면 0) */
    private readonly startMs: number,
  ) {
    this.destination = context.createMediaStreamDestination();
    this.key = recordingKey(interviewId, startMs);
  }

  addStream(stream: MediaStream) {
    this.context.createMediaStreamSource(stream).connect(this.destination);
  }

  async start() {
    this.mimeType = pickMimeType();
    const recorder = new MediaRecorder(this.destination.stream, {
      mimeType: this.mimeType || undefined,
      audioBitsPerSecond: 64_000,
    });
    this.mimeType = recorder.mimeType || this.mimeType || "audio/webm";
    await putMeta({
      interviewId: this.interviewId,
      startMs: this.startMs,
      mimeType: this.mimeType,
      startedAt: Date.now(),
      finished: false,
    });
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      this.chunks.push(event.data);
      const write = putChunk(this.key, this.seq++, event.data).catch((error) =>
        console.error("녹음 조각 저장 실패", error),
      );
      this.pendingWrites.push(write);
    };
    recorder.start(TIMESLICE_MS);
    this.recorder = recorder;
  }

  /** 녹음을 멈추고 구간 파일을 돌려준다. IndexedDB 기록도 끝났음을 표시한다. */
  async stop(durationMs: number): Promise<Blob> {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await Promise.all(this.pendingWrites);
    await putMeta({
      interviewId: this.interviewId,
      startMs: this.startMs,
      mimeType: this.mimeType,
      startedAt: Date.now() - durationMs,
      durationMs,
      finished: true,
    }).catch((error) => console.error("녹음 메타 저장 실패", error));
    return new Blob(this.chunks, { type: this.mimeType });
  }
}
