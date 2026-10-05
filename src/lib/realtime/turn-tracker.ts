// Realtime 서버 이벤트를 받아 지원자·면접관 턴을 조립한다.
// 모든 시각은 녹음 기준 시계(now)로 잰다 — PRD 5절 "시간 기준 (단일 시계)".

export type TurnRole = "interviewer" | "candidate";

export type FinalTurn = {
  role: TurnRole;
  text: string;
  startMs: number;
  endMs: number;
  itemId: string | null;
  interrupted: boolean;
  /** 이 턴이 속한 예상 질문 (start_question 도구로 파악, 없으면 null) */
  questionId: string | null;
};

export type LiveTurn = {
  key: string;
  role: TurnRole;
  text: string;
  startMs: number;
  final: boolean;
  interrupted: boolean;
};

type CandidateState = {
  itemId: string;
  startMs: number;
  endMs?: number;
  text: string;
  transcribed: boolean;
  emitted: boolean;
  questionId?: string | null;
};

type InterviewerState = {
  responseId: string;
  itemId?: string;
  startMs?: number;
  firstTextMs?: number;
  endMs?: number;
  text: string;
  transcriptDone: boolean;
  audioStarted: boolean;
  audioDone: boolean;
  interrupted: boolean;
  emitted: boolean;
  questionId?: string | null;
};

export type ServerEvent = { type: string; [key: string]: unknown };

type Listener = {
  onFinal: (turn: FinalTurn) => void;
  onChange: () => void;
};

const TRANSCRIPTION_FAILED = "(전사 실패 — 녹음으로 확인하세요)";

export class TurnTracker {
  private candidates = new Map<string, CandidateState>();
  private interviewers = new Map<string, InterviewerState>();
  candidateSpeaking = false;
  interviewerSpeaking = false;
  /** 응답 지연(ms): 지원자 발화 끝 감지 → 면접관 오디오 재생 시작 (G3) */
  readonly latencies: number[] = [];
  private lastSpeechStoppedMs: number | null = null;

  constructor(
    private readonly now: () => number,
    private readonly listener: Listener,
    /** 지금 진행 중인 예상 질문 id. 지원자 턴은 말을 시작한 시점, 면접관 턴은 response.done 시점 값을 쓴다. */
    private readonly questionId: () => string | null = () => null,
  ) {}

  handle(event: ServerEvent) {
    const s = (key: string) => (typeof event[key] === "string" ? (event[key] as string) : "");
    switch (event.type) {
      case "input_audio_buffer.speech_started": {
        const c = this.candidate(s("item_id"));
        c.startMs = this.now();
        c.questionId = this.questionId();
        this.candidateSpeaking = true;
        break;
      }
      case "input_audio_buffer.speech_stopped": {
        const c = this.candidate(s("item_id"));
        c.endMs = this.now();
        this.lastSpeechStoppedMs = c.endMs;
        this.candidateSpeaking = false;
        this.maybeEmitCandidate(c);
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        const c = this.candidate(s("item_id"));
        if (!c.transcribed) c.text += s("delta");
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const c = this.candidate(s("item_id"));
        c.text = s("transcript").trim();
        c.transcribed = true;
        this.maybeEmitCandidate(c);
        break;
      }
      case "conversation.item.input_audio_transcription.failed": {
        const c = this.candidate(s("item_id"));
        c.text = c.text.trim() || TRANSCRIPTION_FAILED;
        c.transcribed = true;
        this.maybeEmitCandidate(c);
        break;
      }
      case "response.output_audio_transcript.delta": {
        const r = this.interviewer(s("response_id"));
        r.itemId ||= s("item_id") || undefined;
        r.firstTextMs ??= this.now();
        if (!r.transcriptDone) r.text += s("delta");
        break;
      }
      case "response.output_audio_transcript.done": {
        const r = this.interviewer(s("response_id"));
        r.itemId ||= s("item_id") || undefined;
        r.text = s("transcript").trim() || r.text;
        r.transcriptDone = true;
        this.maybeEmitInterviewer(r);
        break;
      }
      case "output_audio_buffer.started": {
        const r = this.interviewer(s("response_id"));
        r.startMs = this.now();
        r.audioStarted = true;
        if (this.lastSpeechStoppedMs !== null) {
          this.latencies.push(r.startMs - this.lastSpeechStoppedMs);
          this.lastSpeechStoppedMs = null;
        }
        this.interviewerSpeaking = true;
        break;
      }
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared": {
        const r = this.interviewer(s("response_id"));
        r.endMs = this.now();
        r.audioDone = true;
        if (event.type === "output_audio_buffer.cleared") r.interrupted = true;
        this.interviewerSpeaking = false;
        this.maybeEmitInterviewer(r);
        break;
      }
      case "response.done": {
        const response = (event.response ?? {}) as { id?: string; status?: string };
        if (!response.id) break;
        const r = this.interviewer(response.id);
        if (response.status === "cancelled") r.interrupted = true;
        // 세션이 같은 응답의 start_question 호출을 먼저 처리하므로, 이 시점 값이 "이 응답이 꺼낸 질문"이다.
        r.questionId = this.questionId();
        r.transcriptDone = true;
        // 오디오 재생이 시작되지 않았다면 이후에도 시작되지 않는다.
        if (!r.audioStarted) r.audioDone = true;
        this.maybeEmitInterviewer(r);
        break;
      }
      default:
        return;
    }
    this.listener.onChange();
  }

  /** 면접 종료 시 아직 끝나지 않은 턴을 지금까지의 내용으로 확정한다. */
  flush() {
    const end = this.now();
    for (const c of this.candidates.values()) {
      if (c.emitted) continue;
      c.endMs ??= end;
      c.transcribed = true;
      this.maybeEmitCandidate(c);
    }
    for (const r of this.interviewers.values()) {
      if (r.emitted) continue;
      if (!r.audioDone) {
        r.endMs = end;
        r.interrupted = r.interrupted || r.audioStarted;
      }
      r.audioDone = true;
      r.transcriptDone = true;
      this.maybeEmitInterviewer(r);
    }
    this.candidateSpeaking = false;
    this.interviewerSpeaking = false;
    this.listener.onChange();
  }

  liveTurns(): LiveTurn[] {
    const turns: LiveTurn[] = [];
    for (const c of this.candidates.values()) {
      if (!c.text && !this.candidateSpeaking) continue;
      if (c.emitted && !c.text) continue;
      turns.push({
        key: `c:${c.itemId}`,
        role: "candidate",
        text: c.text,
        startMs: c.startMs,
        final: c.emitted,
        interrupted: false,
      });
    }
    for (const r of this.interviewers.values()) {
      if (!r.text) continue;
      turns.push({
        key: `i:${r.responseId}`,
        role: "interviewer",
        text: r.text,
        startMs: r.startMs ?? r.firstTextMs ?? 0,
        final: r.emitted,
        interrupted: r.interrupted,
      });
    }
    return turns.sort((a, b) => a.startMs - b.startMs);
  }

  private candidate(itemId: string) {
    const key = itemId || "unknown";
    let c = this.candidates.get(key);
    if (!c) {
      c = { itemId: key, startMs: this.now(), text: "", transcribed: false, emitted: false };
      this.candidates.set(key, c);
    }
    return c;
  }

  private interviewer(responseId: string) {
    const key = responseId || "unknown";
    let r = this.interviewers.get(key);
    if (!r) {
      r = {
        responseId: key,
        text: "",
        transcriptDone: false,
        audioStarted: false,
        audioDone: false,
        interrupted: false,
        emitted: false,
      };
      this.interviewers.set(key, r);
    }
    return r;
  }

  private maybeEmitCandidate(c: CandidateState) {
    if (c.emitted || !c.transcribed || c.endMs === undefined) return;
    c.emitted = true;
    if (!c.text.trim()) return;
    this.listener.onFinal({
      role: "candidate",
      text: c.text.trim(),
      startMs: Math.max(0, c.startMs),
      endMs: Math.max(c.startMs, c.endMs),
      itemId: c.itemId === "unknown" ? null : c.itemId,
      interrupted: false,
      questionId: c.questionId ?? this.questionId(),
    });
  }

  private maybeEmitInterviewer(r: InterviewerState) {
    if (r.emitted || !r.transcriptDone || !r.audioDone) return;
    r.emitted = true;
    if (!r.text.trim()) return;
    const startMs = Math.max(0, r.startMs ?? r.firstTextMs ?? this.now());
    this.listener.onFinal({
      role: "interviewer",
      text: r.text.trim(),
      startMs,
      endMs: Math.max(startMs, r.endMs ?? this.now()),
      itemId: r.itemId ?? null,
      interrupted: r.interrupted,
      questionId: r.questionId ?? this.questionId(),
    });
  }
}
