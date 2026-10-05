// L-3: MediaRecorder가 만든 webm에는 duration과 cue(탐색 색인)가 없어 특정 지점으로 이동이 안 된다.
// 메타데이터를 다시 써서 탐색 가능한 파일로 만든다.

async function loadEbml() {
  // ts-ebml은 전역 Buffer를 쓴다. 브라우저에서는 폴리필을 먼저 심는다.
  const g = globalThis as { Buffer?: unknown };
  if (!g.Buffer) g.Buffer = (await import("buffer")).Buffer;
  return import("ts-ebml");
}

export async function makeSeekable(input: Blob): Promise<Blob> {
  if (!input.type.includes("webm")) return input;
  const { Decoder, Reader, tools } = await loadEbml();
  const buffer = await input.arrayBuffer();
  const reader = new Reader();
  reader.logging = false;
  reader.drop_default_duration = false;
  for (const element of new Decoder().decode(buffer)) reader.read(element);
  reader.stop();
  const metadata = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues);
  return new Blob([metadata, buffer.slice(reader.metadataSize)], { type: input.type });
}
