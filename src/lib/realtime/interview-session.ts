import { openMicrophone, routeToSpeaker, type AudioDevicePrefs } from "@/lib/audio-devices";
import { MixedRecorder } from "@/lib/recorder/mixed-recorder";
import { uploadSegment, type UploadResult } from "@/lib/recorder/upload";
import { needsFollowUpResponse, QuestionTracker, type ProtocolQuestion } from "./question-protocol";
import { buildResumeItems, type ResumeTurn } from "./resume-context";
import { RESPONSE_DELAY_MS, ResponseGate } from "./response-gate";
import { TurnTracker, type FinalTurn, type LiveTurn, type ServerEvent } from "./turn-tracker";

export type EndReason = "user" | "timeout" | "pause" | "disconnected" | "error";
export type SessionPhase = "idle" | "connecting" | "live" | "ending" | "ended";

/** 일시정지된 면접을 이어갈 때 넘기는 이전 상태 */
export type ResumeState = {
  /** 이전 구간까지의 누적 진행 시간. 이번 구간의 시계가 여기서 이어진다. */
  activeMs: number;
  /** 일시정지 시점의 질문 번호(0부터). 인사 단계면 null */
  questionIndex: number | null;
  /** 저장된 대화. 면접관에게 다시 들려준다. */
  turns: ResumeTurn[];
  pausedForMs: number;
};

export type SessionSnapshot = {
  phase: SessionPhase;
  elapsedMs: number;
  turns: LiveTurn[];
  candidateSpeaking: boolean;
  interviewerSpeaking: boolean;
  awaitingResponse: boolean;
  /** 사용자가 직접 끈 음소거 */
  muted: boolean;
  /** 실제로 마이크 소리가 나가는 중인지. 응답 요청부터 재생 종료까지 자동으로 닫힌다. */
  micOpen: boolean;
  wrapUpSent: boolean;
  /** 진행 중인 예상 질문 (0부터). null이면 아직 인사·자기소개 단계 */
  currentQuestionIndex: number | null;
  error: string | null;
};

export type SessionMetrics = {
  /** 응답 지연 (ms) */
  latencyP50: number | null;
  latencyP95: number | null;
  latencySamples: number;
  responseDelayMs: number;
  lateSpeechCount: number;
  requestFailureCount: number;
  /** response.done / 전사 완료 이벤트의 usage 합계 (비용 실측용) */
  usage: Record<string, number>;
};

export type EndResult = {
  reason: EndReason;
  status: "paused" | "completed" | "aborted";
  /** 누적 진행 시간 */
  durationMs: number;
  upload: UploadResult;
  metrics: SessionMetrics;
};

const WRAP_UP_INSTRUCTION =
  "[진행 안내] 남은 시간이 약 1분입니다. 방금 답변에 짧게 반응한 뒤 \"마지막으로 하고 싶은 말이 있나요?\"라고 묻고, 답을 들은 뒤 \"면접을 마치겠습니다\"라고 말하며 마무리하세요.";

const DISCONNECT_GRACE_MS = 5000;

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** usage 객체의 숫자 필드를 평탄화해 누적한다 (예: input_token_details.audio_tokens). */
function addUsage(total: Record<string, number>, usage: unknown, prefix = "") {
  if (!usage || typeof usage !== "object") return;
  for (const [key, value] of Object.entries(usage)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "number") total[name] = (total[name] ?? 0) + value;
    else addUsage(total, value, name);
  }
}

/**
 * 모의 면접 한 번의 실시간 세션.
 * - WebRTC로 OpenAI Realtime에 연결 (SDP는 서버가 대신 전달, R-1)
 * - 마이크 + 면접관 음성을 섞어 녹음 (L-1, L-9)
 * - 모든 시각은 녹음 그래프의 AudioContext 시계 하나로 잰다 (PRD 5절)
 * - 일시정지는 통화를 끝내고 상태를 저장하는 것이고, 재개는 새 통화를 열어 이전 대화를 주입하는 것이다.
 *   누적 시계는 이전 구간의 진행 시간(baseMs)에서 이어진다.
 */
export class InterviewSession {
  private context: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private recorder: MixedRecorder | null = null;
  private t0 = 0;
  private readonly baseMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPosts = new Set<Promise<void>>();
  private wrapUpPending = false;
  private endPromise: Promise<EndResult> | null = null;
  private usage: Record<string, number> = {};
  private readonly tracker: TurnTracker;
  private readonly questions: QuestionTracker;
  private readonly gate: ResponseGate;
  private state: SessionSnapshot = {
    phase: "idle",
    elapsedMs: 0,
    turns: [],
    candidateSpeaking: false,
    interviewerSpeaking: false,
    awaitingResponse: false,
    muted: false,
    micOpen: false,
    wrapUpSent: false,
    currentQuestionIndex: null,
    error: null,
  };

  constructor(
    private readonly interviewId: string,
    private readonly maxMinutes: number,
    questions: ProtocolQuestion[],
    private readonly callbacks: {
      onChange: (snapshot: SessionSnapshot) => void;
      onEnded: (result: EndResult) => void;
    },
    private readonly resume: ResumeState | null = null,
  ) {
    this.baseMs = resume?.activeMs ?? 0;
    this.questions = new QuestionTracker(questions, resume?.questionIndex ?? null);
    this.state = { ...this.state, elapsedMs: this.baseMs, currentQuestionIndex: this.questions.current };
    this.tracker = new TurnTracker(
      () => this.now(),
      { onFinal: (turn) => this.postTurn(turn), onChange: () => this.sync() },
      () => this.questions.currentId,
    );
    this.gate = new ResponseGate({
      delayMs: RESPONSE_DELAY_MS,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      send: (event) => this.send(event),
      onChange: () => this.sync(),
      onFailure: (message) => this.failResponse(message),
    });
  }

  /** 누적 진행 시계 (ms). 이전 구간의 진행 시간에 이번 구간의 녹음 시계를 더한다. */
  now() {
    if (!this.context || !this.t0) return this.baseMs;
    return this.baseMs + Math.max(0, Math.round((this.context.currentTime - this.t0) * 1000));
  }

  /** 이번 구간의 녹음 길이 (ms) */
  private segmentMs() {
    return this.now() - this.baseMs;
  }

  get snapshot() {
    return this.state;
  }

  /** 사용자 클릭 핸들러 안에서 호출해야 한다(AudioContext 자동재생 정책). */
  async start(devices: AudioDevicePrefs = { inputId: "", outputId: "" }) {
    this.update({ phase: "connecting", error: null });
    try {
      this.mic = await openMicrophone(devices.inputId);
      this.applyMicGate(); // 연결 중에는 인사 전 발화를 서버로 보내지 않는다.
      this.context = new AudioContext();
      await this.context.resume();

      this.recorder = new MixedRecorder(this.context, this.interviewId, this.baseMs);
      this.recorder.addStream(this.mic);
      await this.recorder.start();
      this.t0 = this.context.currentTime || 1e-6;

      const pc = new RTCPeerConnection();
      this.pc = pc;
      // Chrome은 원격 WebRTC 트랙을 미디어 요소에 붙여야 Web Audio로 소리가 흐른다 (L-1).
      this.audioElement = document.createElement("audio");
      this.audioElement.autoplay = true;
      await routeToSpeaker(this.audioElement, devices.outputId);
      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream || !this.audioElement) return;
        this.audioElement.srcObject = stream;
        this.recorder?.addStream(stream);
      };
      pc.onconnectionstatechange = () => this.onConnectionState(pc.connectionState);
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);

      const channel = pc.createDataChannel("oai-events");
      this.channel = channel;
      channel.onmessage = (message) => this.onServerEvent(message.data);
      channel.onopen = () => {
        if (this.state.phase !== "connecting") return;
        // 재개: 이전 대화를 먼저 넣어야 첫 응답이 이어가는 말이 된다. 데이터 채널은 순서가 보장된다.
        if (this.resume?.turns.length) {
          const items = buildResumeItems(this.resume.turns, {
            questionIndex: this.resume.questionIndex,
            questionCount: this.questionCount,
            pausedForMs: this.resume.pausedForMs,
          });
          for (const item of items) {
            if (!this.send(item)) {
              this.failResponse("이전 대화를 전송하지 못했습니다. 이어하기를 다시 시도해 주세요.");
              return;
            }
          }
        }
        this.update({ phase: "live" });
        this.gate.request(); // R-2: 인사·재개도 전송 전에 마이크를 닫는다.
        if (this.snapshot.phase !== "live") return;
        this.timer = setInterval(() => this.tick(), 250);
      };
      channel.onclose = () => {
        if (this.state.phase === "live") void this.end("disconnected");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch(`/api/realtime/call?interviewId=${this.interviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `연결 실패 (${response.status})`);
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요."
          : error instanceof Error
            ? error.message
            : String(error);
      this.update({ error: message });
      await this.end("error");
      throw error;
    }
  }

  private get questionCount() {
    return this.questions.count;
  }

  /** 일시정지. 마무리 안내가 이미 나갔으면(마지막 1분) 그냥 끝내는 편이 낫다. */
  pause() {
    if (this.state.wrapUpSent) return null;
    return this.end("pause");
  }

  setMuted(muted: boolean) {
    this.update({ muted });
    this.applyMicGate();
  }

  /**
   * 반이중 통화: 면접관 응답을 요청한 시점부터 재생 종료까지 마이크를 닫는다.
   * 트랙을 끄면 WebRTC는 무음을 보내고, 녹음에도 무음이 남는다.
   */
  private applyMicGate() {
    const open = this.state.phase === "live" && !this.state.muted && !this.tracker.interviewerSpeaking && !this.gate.awaitingResponse;
    for (const track of this.mic?.getAudioTracks() ?? []) track.enabled = open;
    if (open !== this.state.micOpen) this.update({ micOpen: open });
  }

  end(reason: EndReason): Promise<EndResult> {
    this.endPromise ??= this.finish(reason);
    return this.endPromise;
  }

  private async finish(reason: EndReason): Promise<EndResult> {
    this.update({ phase: "ending" });
    this.gate.dispose();
    this.applyMicGate();
    if (this.timer) clearInterval(this.timer);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);

    const durationMs = this.now();
    const segmentMs = this.segmentMs();
    this.tracker.flush();
    // 종료 중에 도구 호출이나 새 응답이 이어지지 않게 통신부터 닫는다.
    this.channel?.close();
    this.pc?.close();
    const recording = this.recorder ? await this.recorder.stop(segmentMs).catch(() => null) : null;
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    if (this.audioElement) this.audioElement.srcObject = null;
    await this.context?.close().catch(() => {});

    await Promise.allSettled([...this.pendingPosts]);

    // 사용자 종료·시간 초과는 완료, 일시정지와 연결 끊김은 일시정지(나중에 이어하기), 그 밖의 오류는 중단.
    // 단 오류라도 대화가 있었으면 이어할 수 있게 일시정지로 둔다.
    const status: EndResult["status"] =
      reason === "user" || reason === "timeout"
        ? "completed"
        : reason === "pause" || reason === "disconnected" || this.tracker.liveTurns().length > 0 || this.baseMs > 0
          ? "paused"
          : "aborted";
    await fetch(`/api/interviews/${this.interviewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        durationMs,
        currentQuestionIndex: this.questions.current,
        // 다른 구간의 녹음은 이미 올라가 있을 수 있으므로, 이번 구간이 없을 때는 집계 상태를 건드리지 않는다.
        ...(recording?.size ? { audioStatus: "pending" } : {}),
      }),
    }).catch((error) => console.error("면접 상태 저장 실패", error));

    const upload: UploadResult = recording?.size
      ? await uploadSegment(this.interviewId, this.baseMs, { blob: recording, durationMs: segmentMs })
      : { ok: false, error: "녹음이 없습니다." };

    const latencies = this.tracker.latencies;
    const metrics: SessionMetrics = {
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
      latencySamples: latencies.length,
      responseDelayMs: RESPONSE_DELAY_MS,
      lateSpeechCount: this.gate.lateSpeechCount,
      requestFailureCount: this.gate.requestFailureCount,
      usage: this.usage,
    };
    console.info("[interview metrics]", metrics);
    const result: EndResult = { reason, status, durationMs, upload, metrics };
    this.update({ phase: "ended" });
    this.callbacks.onEnded(result);
    return result;
  }

  private onConnectionState(state: RTCPeerConnectionState) {
    if (this.state.phase !== "live") return;
    if (state === "failed") void this.end("disconnected");
    else if (state === "disconnected") {
      this.disconnectTimer ??= setTimeout(() => {
        if (this.pc?.connectionState !== "connected") void this.end("disconnected");
      }, DISCONNECT_GRACE_MS);
    } else if (state === "connected" && this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private onServerEvent(raw: unknown) {
    if (this.state.phase !== "live") return;
    let event: ServerEvent;
    try {
      event = JSON.parse(String(raw)) as ServerEvent;
    } catch {
      return;
    }
    if (event.type === "error") {
      this.gate.handle(event);
      if (this.state.phase !== "live") return;
      const error = event.error as { code?: string; message?: string } | undefined;
      console.error("Realtime error", event);
      this.update({ error: error?.message ?? "Realtime 오류" });
      return;
    }
    let followUp = false;
    if (event.type === "response.done") {
      addUsage(this.usage, (event.response as { usage?: unknown } | undefined)?.usage, "response");
      const status = (event.response as { status?: string } | undefined)?.status;
      if (status === "completed") followUp = this.handleQuestionCalls(event);
    } else if (event.type === "conversation.item.input_audio_transcription.completed") {
      addUsage(this.usage, event.usage, "transcription");
    }
    if (this.state.phase !== "live") return;
    this.tracker.handle(event);
    // R-8: 지원자가 말하는 중이었다면 답변이 끝난 뒤에 마무리 지시를 보낸다.
    if (event.type === "input_audio_buffer.speech_stopped" && this.wrapUpPending) this.sendWrapUp();
    this.gate.handle(event, followUp);
  }

  /** start_question 도구 호출에 답하고 사이드바 상태를 올린다. 턴 스탬프가 이 값을 쓰므로 tracker.handle보다 먼저 부른다. */
  private handleQuestionCalls(event: ServerEvent) {
    const replies = this.questions.handle(event);
    for (const reply of replies) {
      const sent = this.send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: reply.callId, output: reply.output },
      });
      if (!sent) {
        this.failResponse("질문 전환을 전송하지 못했습니다. 이어하기로 다시 진행해 주세요.");
        return false;
      }
    }
    // 도구 호출 뒤에 질문을 말했으면 지원자의 다음 답변 뒤 유예 게이트가 응답을 만든다.
    // 호출로 끝난 응답이면(앞에 "잠시만요" 같은 말만 있어도) 아무도 질문하지 않아 멈추므로 새 응답을 요청한다.
    const output = (event.response as { output?: { type?: string; name?: string }[] } | undefined)?.output ?? [];
    if (this.questions.current !== this.state.currentQuestionIndex) {
      this.update({ currentQuestionIndex: this.questions.current });
    }
    return replies.length > 0 && needsFollowUpResponse(output);
  }

  private tick() {
    const elapsedMs = this.now();
    const limitMs = this.maxMinutes * 60_000;
    if (!this.state.wrapUpSent && !this.wrapUpPending && elapsedMs >= limitMs - 60_000) {
      this.wrapUpPending = true;
      if (!this.tracker.candidateSpeaking) this.sendWrapUp();
    }
    if (elapsedMs >= limitMs) {
      void this.end("timeout");
      return;
    }
    this.update({ elapsedMs });
  }

  private sendWrapUp() {
    this.wrapUpPending = false;
    const sent = this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text: WRAP_UP_INSTRUCTION }] },
    });
    if (!sent) {
      this.failResponse("마무리 안내를 전송하지 못했습니다. 이어하기로 다시 진행해 주세요.");
      return;
    }
    this.update({ wrapUpSent: true });
  }

  private send(event: Record<string, unknown>) {
    if (this.channel?.readyState !== "open") return false;
    try {
      this.channel.send(JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  }

  private failResponse(message: string) {
    this.update({ error: message });
    void this.end("error");
  }

  private postTurn(turn: FinalTurn) {
    const post = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(`/api/interviews/${this.interviewId}/turns`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(turn),
          });
          if (response.ok) return;
        } catch {
          // 네트워크 오류는 재시도
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
      console.error("턴 저장 실패", turn);
    })();
    this.pendingPosts.add(post);
    void post.finally(() => this.pendingPosts.delete(post));
  }

  private sync() {
    this.update({
      turns: this.tracker.liveTurns(),
      candidateSpeaking: this.tracker.candidateSpeaking,
      interviewerSpeaking: this.tracker.interviewerSpeaking,
      awaitingResponse: this.gate.awaitingResponse,
    });
    this.applyMicGate();
  }

  private update(patch: Partial<SessionSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.callbacks.onChange(this.state);
  }
}
