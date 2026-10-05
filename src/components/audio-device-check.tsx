"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadAudioDevices,
  openMicrophone,
  routeToSpeaker,
  saveAudioDevices,
  type AudioDevicePrefs,
} from "@/lib/audio-devices";

type Status = "idle" | "requesting" | "ready" | "denied" | "error";
type MicTest = "idle" | "recording" | "playing";

const MIC_TEST_MS = 3000;
/** 이 이상이면 "소리가 들어온다"고 본다 (0~1, 대략 -45dB) */
const HEARD_LEVEL = 0.25;

function deviceLabel(device: MediaDeviceInfo, index: number, kind: string) {
  return device.label || `${kind} ${index + 1}`;
}

/** 면접 시작 전 마이크·스피커를 고르고 확인한다. 고른 장치는 면접 화면에서 그대로 쓴다. */
export function AudioDeviceCheck({ voice }: { voice: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [prefs, setPrefs] = useState<AudioDevicePrefs>(loadAudioDevices);
  const [heard, setHeard] = useState(false);
  const [micTest, setMicTest] = useState<MicTest>("idle");
  const [speakerPlaying, setSpeakerPlaying] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef(0);
  const meterRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const heardRef = useRef(false);
  const prefsRef = useRef(prefs);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  /** 마이크를 빠르게 바꾸거나 모달을 닫으면 늦게 열린 스트림은 버린다. */
  const requestRef = useRef(0);
  const restartRef = useRef<(inputId: string) => Promise<void>>(async () => {});

  const updatePrefs = useCallback((patch: Partial<AudioDevicePrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    saveAudioDevices(next);
  }, []);

  const refreshDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setInputs(devices.filter((d) => d.kind === "audioinput" && d.deviceId));
    setOutputs(devices.filter((d) => d.kind === "audiooutput" && d.deviceId));
  }, []);

  const stopPlayback = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder?.state === "recording") recorder.stop();
    audioRef.current?.pause();
    audioRef.current = null;
    setMicTest("idle");
    setSpeakerPlaying(false);
  }, []);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    streamRef.current = null;
  }, []);

  const startMic = useCallback(
    async (inputId: string) => {
      stopMic();
      const request = ++requestRef.current;
      // 장치만 바꾸는 중이면 화면을 그대로 둔다.
      setStatus((s) => (s === "ready" ? s : "requesting"));
      try {
        const stream = await openMicrophone(inputId);
        if (request !== requestRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const [track] = stream.getAudioTracks();
        // 저장된 장치가 없어서 기본 마이크로 열렸을 수 있으니 실제로 열린 장치를 기억한다.
        updatePrefs({ inputId: track.getSettings().deviceId ?? "" });
        // 쓰던 마이크를 뽑으면 기본 마이크로 다시 연다.
        track.onended = () => void restartRef.current("");
        await refreshDevices();

        const context = (contextRef.current ??= new AudioContext());
        await context.resume();
        if (request !== requestRef.current) return;
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        sourceRef.current = context.createMediaStreamSource(stream);
        sourceRef.current.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let level = 0;
        const draw = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const s of samples) sum += s * s;
          const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-8);
          // -60dB~0dB를 0~1로. 올라갈 땐 바로, 내려갈 땐 천천히.
          level = Math.max(Math.min(1, Math.max(0, (db + 60) / 60)), level * 0.9);
          if (meterRef.current) meterRef.current.style.transform = `scaleX(${level})`;
          if (level >= HEARD_LEVEL && !heardRef.current) {
            heardRef.current = true;
            setHeard(true);
          }
          frameRef.current = requestAnimationFrame(draw);
        };
        draw();
        setStatus("ready");
      } catch (error) {
        if (request !== requestRef.current) return;
        setStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "error");
      }
    },
    [refreshDevices, stopMic, updatePrefs],
  );

  useEffect(() => {
    restartRef.current = startMic;
  }, [startMic]);

  // 이미 마이크를 허용했다면 모달을 열자마자 측정을 시작한다. 처음이면 버튼을 눌러 권한을 받는다.
  useEffect(() => {
    let cancelled = false;
    const requests = requestRef;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((permission) => {
        if (!cancelled && permission.state === "granted") void startMic(prefsRef.current.inputId);
        if (!cancelled && permission.state === "denied") setStatus("denied");
      })
      .catch(() => {});
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      cancelled = true;
      requests.current++;
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
      stopPlayback();
      stopMic();
      void contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    };
  }, [refreshDevices, startMic, stopMic, stopPlayback]);

  async function play(src: string, onEnd: () => void) {
    audioRef.current?.pause();
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = audio.onerror = () => {
      if (audioRef.current === audio) audioRef.current = null;
      onEnd();
    };
    await routeToSpeaker(audio, prefsRef.current.outputId);
    await audio.play().catch(onEnd);
  }

  function testSpeaker() {
    if (speakerPlaying) return stopPlayback();
    stopPlayback();
    setSpeakerPlaying(true);
    void play(`/voice-samples/${voice}.mp3`, () => setSpeakerPlaying(false));
  }

  function testMic() {
    const stream = streamRef.current;
    if (micTest !== "idle") return stopPlayback();
    if (!stream) return;
    stopPlayback();
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      if (recorderRef.current !== recorder) return; // 녹음 도중 취소됨
      recorderRef.current = null;
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      setMicTest("playing");
      void play(url, () => {
        URL.revokeObjectURL(url);
        setMicTest("idle");
      });
    };
    recorder.start();
    setMicTest("recording");
    setTimeout(() => recorder.state === "recording" && recorder.stop(), MIC_TEST_MS);
  }

  const inputValue = inputs.some((d) => d.deviceId === prefs.inputId) ? prefs.inputId : (inputs[0]?.deviceId ?? "");
  const outputValue = outputs.some((d) => d.deviceId === prefs.outputId) ? prefs.outputId : (outputs[0]?.deviceId ?? "");

  return (
    <section>
      <span className="label">마이크·스피커</span>
      {status === "idle" || status === "requesting" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm text-muted">시작 전에 마이크와 스피커가 잘 되는지 확인하세요.</p>
          <button type="button" className="btn btn-sm shrink-0" disabled={status === "requesting"}
            onClick={() => void startMic(prefs.inputId)}>
            {status === "requesting" ? "마이크 여는 중…" : "장치 확인하기"}
          </button>
        </div>
      ) : status === "denied" ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          마이크 권한이 막혀 있습니다. 주소창 왼쪽의 사이트 설정에서 마이크를 허용한 뒤 다시 열어 주세요.
        </p>
      ) : status === "error" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <p>마이크를 열지 못했습니다. 다른 앱이 쓰고 있지 않은지 확인하세요.</p>
          <button type="button" className="btn btn-sm shrink-0" onClick={() => void startMic("")}>다시 시도</button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="mic-device">마이크</label>
            <div className="flex gap-2">
              <select id="mic-device" className="input" value={inputValue}
                onChange={(e) => {
                  heardRef.current = false;
                  setHeard(false);
                  stopPlayback();
                  void startMic(e.target.value);
                }}>
                {inputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{deviceLabel(d, i, "마이크")}</option>)}
              </select>
              <button type="button" className="btn shrink-0" onClick={testMic} disabled={speakerPlaying}>
                {micTest === "recording" ? "녹음 중…" : micTest === "playing" ? "■ 정지" : "녹음해서 듣기"}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div ref={meterRef} className={`h-full origin-left rounded-full ${heard ? "bg-success" : "bg-primary"}`}
                  style={{ transform: "scaleX(0)" }} />
              </div>
              <span role="status" className={`w-28 shrink-0 text-right text-xs ${heard ? "text-success" : "text-muted"}`}>
                {heard ? "소리가 들어옵니다" : "말해 보세요"}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="speaker-device">스피커</label>
            {outputs.length ? (
              <div className="flex gap-2">
                <select id="speaker-device" className="input" value={outputValue}
                  onChange={(e) => {
                    stopPlayback();
                    updatePrefs({ outputId: e.target.value });
                  }}>
                  {outputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{deviceLabel(d, i, "스피커")}</option>)}
                </select>
                <button type="button" className="btn shrink-0" onClick={testSpeaker} disabled={micTest !== "idle"}>
                  {speakerPlaying ? "■ 정지" : "소리 테스트"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">이 브라우저에서는 스피커를 고를 수 없어 시스템 기본 스피커를 씁니다.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
