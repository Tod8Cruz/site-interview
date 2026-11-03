import type { ServerEvent } from "./turn-tracker";

export const RESPONSE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 15_000;

type ResponseState = { done: boolean; audio: boolean; drained: boolean };
type Options = {
  delayMs: number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  send: (event: Record<string, unknown>) => boolean;
  onChange: () => void;
  onFailure: (message: string) => void;
};

/** VAD는 입력을 확정하고, 이 게이트는 유예 뒤 응답을 요청한다. WebRTC에 의존하지 않는다. */
export class ResponseGate {
  private delay: unknown = null;
  private pending: { id: string; timer: unknown } | null = null;
  private responses = new Map<string, ResponseState>();
  private uncommitted = new Set<string>();
  private speaking = false;
  private graceElapsed = false;
  private sequence = 0;
  private disposed = false;
  private failed = false;
  lateSpeechCount = 0;
  requestFailureCount = 0;

  constructor(private readonly opts: Options) {}

  get awaitingResponse() {
    return this.failed || this.pending !== null || this.responses.size > 0;
  }

  /** 최초 인사와 도구 후속 응답도 반드시 이 경로를 사용한다. 전송 전에 마이크를 닫는다. */
  request() {
    if (this.disposed || this.failed) return;
    if (this.pending || [...this.responses.values()].some((r) => !r.done)) {
      this.fail("면접관 응답 요청이 겹쳤습니다. 이어하기로 다시 진행해 주세요.");
      return;
    }
    this.cancelDelay();
    const id = `response_gate_${++this.sequence}`;
    const timer = this.opts.setTimer(() => {
      this.fail("면접관 응답 요청이 확인되지 않았습니다. 이어하기로 다시 진행해 주세요.");
    }, REQUEST_TIMEOUT_MS);
    this.pending = { id, timer };
    this.opts.onChange();
    try {
      if (!this.opts.send({ type: "response.create", event_id: id, response: { metadata: { request_event_id: id } } })) {
        this.fail("면접관 응답 요청을 전송하지 못했습니다. 이어하기로 다시 진행해 주세요.");
      }
    } catch {
      this.fail("면접관 응답 요청을 전송하지 못했습니다. 이어하기로 다시 진행해 주세요.");
    }
  }

  /** followUp은 세션이 도구 출력을 성공적으로 보낸 response.done에만 지정한다. */
  handle(event: ServerEvent, followUp = false) {
    if (this.disposed || this.failed) return;
    const itemId = typeof event.item_id === "string" ? event.item_id : "";
    const responseId = typeof event.response_id === "string" ? event.response_id : "";
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.cancelDelay();
        this.speaking = true;
        if (this.awaitingResponse) {
          this.lateSpeechCount++;
          // 이미 전송 중인 오디오를 롤백하지 않는다. 다음 질문의 답으로 소비하기 전에 통화를 정리한다.
          this.fail("면접관 응답 준비와 발화가 겹쳐 면접을 일시정지합니다. 이어하기 후 마지막 답변을 다시 말씀해 주세요.", false);
        }
        break;
      case "input_audio_buffer.speech_stopped":
        this.speaking = false;
        if (this.awaitingResponse) break;
        if (itemId) this.uncommitted.add(itemId);
        this.cancelDelay();
        this.delay = this.opts.setTimer(() => {
          this.delay = null;
          if (this.disposed || this.failed) return;
          this.graceElapsed = true;
          this.requestWhenReady();
        }, this.opts.delayMs);
        break;
      case "input_audio_buffer.committed":
        this.uncommitted.delete(itemId);
        this.requestWhenReady();
        break;
      case "response.created": {
        const response = event.response as { id?: string; metadata?: { request_event_id?: string } } | undefined;
        if (!response?.id) break;
        const requestId = response.metadata?.request_event_id;
        if (this.pending && (!requestId || requestId === this.pending.id)) this.clearPending();
        this.responses.set(response.id, { done: false, audio: false, drained: false });
        break;
      }
      case "output_audio_buffer.started": {
        const state = this.responses.get(responseId);
        if (state) state.audio = true;
        break;
      }
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared": {
        const state = this.responses.get(responseId);
        if (state) {
          state.drained = true;
          if (state.done) this.responses.delete(responseId);
        }
        break;
      }
      case "response.done": {
        const response = event.response as {
          id?: string;
          status?: string;
          output?: { content?: { type?: string }[] }[];
        } | undefined;
        if (!response?.id) break;
        if (response.status && response.status !== "completed") {
          this.fail("면접관 응답이 완료되지 않았습니다. 이어하기로 다시 진행해 주세요.");
          return;
        }
        const state = this.responses.get(response.id);
        if (state) {
          state.done = true;
          state.audio ||= Boolean(response.output?.some((item) => item.content?.some((part) => part.type === "audio")));
          if (!state.audio || state.drained) this.responses.delete(response.id);
        }
        // 이전 음성의 종료와 후속 응답 대기를 따로 유지해 중간에 마이크가 열리지 않는다.
        if (followUp) this.request();
        break;
      }
      case "error": {
        const error = event.error as { event_id?: string } | undefined;
        if (this.pending && error?.event_id === this.pending.id) {
          this.fail("면접관 응답 요청이 거절되었습니다. 이어하기로 다시 진행해 주세요.");
        }
        break;
      }
      default:
        return;
    }
    if (!this.disposed) this.opts.onChange();
  }

  dispose() {
    this.disposed = true;
    this.cancelDelay();
    this.clearPending();
    this.responses.clear();
    this.uncommitted.clear();
  }

  private requestWhenReady() {
    if (this.graceElapsed && !this.speaking && !this.uncommitted.size && !this.awaitingResponse) this.request();
  }

  private cancelDelay() {
    if (this.delay !== null) this.opts.clearTimer(this.delay);
    this.delay = null;
    this.graceElapsed = false;
  }

  private clearPending() {
    if (this.pending) this.opts.clearTimer(this.pending.timer);
    this.pending = null;
  }

  private fail(message: string, requestFailure = true) {
    if (this.disposed || this.failed) return;
    this.failed = true;
    if (requestFailure) this.requestFailureCount++;
    this.cancelDelay();
    this.clearPending();
    this.opts.onChange();
    this.opts.onFailure(message);
  }
}
