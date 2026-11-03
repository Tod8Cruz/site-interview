// L-9: 녹음 조각을 IndexedDB에 쌓아, 브라우저가 죽어도 다음 접속 때 복구한다(L-10).
// 일시정지로 나뉜 구간마다 녹음이 하나씩이라, 키는 "면접 ID/구간 시작 ms"다.
// (예전 기록은 키가 면접 ID뿐이며, 구간 시작 0으로 읽는다.)

const DB_NAME = "interview-recordings";
const DB_VERSION = 1;
const CHUNKS = "chunks";
const META = "meta";

export type RecordingMeta = {
  key: string;
  interviewId: string;
  /** 누적 시계에서 이 구간이 시작하는 지점 */
  startMs: number;
  mimeType: string;
  startedAt: number;
  /** 녹음 기준 시계로 잰 구간 길이. 정상 종료 시에만 기록된다. */
  durationMs?: number;
  finished: boolean;
};

/** 저장 형식. 객체 저장소의 keyPath가 interviewId라서 그 자리에 구간 키를 넣는다. */
type MetaRecord = Omit<RecordingMeta, "key" | "interviewId" | "startMs"> & {
  interviewId: string;
  startMs?: number;
};
type ChunkRecord = { interviewId: string; seq: number; data: Blob };

export const recordingKey = (interviewId: string, startMs: number) => `${interviewId}/${startMs}`;

function parseKey(key: string) {
  const slash = key.indexOf("/");
  if (slash < 0) return { interviewId: key, startMs: 0 };
  return { interviewId: key.slice(0, slash), startMs: Number(key.slice(slash + 1)) || 0 };
}

function toMeta(record: MetaRecord): RecordingMeta {
  const { interviewId, startMs } = parseKey(record.interviewId);
  return { ...record, key: record.interviewId, interviewId, startMs: record.startMs ?? startMs };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(CHUNKS, { keyPath: ["interviewId", "seq"] });
      db.createObjectStore(META, { keyPath: "interviewId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const range = (key: string) => IDBKeyRange.bound([key, 0], [key, Number.MAX_SAFE_INTEGER]);

export async function putMeta(meta: Omit<RecordingMeta, "key">) {
  const record: MetaRecord = {
    interviewId: recordingKey(meta.interviewId, meta.startMs),
    startMs: meta.startMs,
    mimeType: meta.mimeType,
    startedAt: meta.startedAt,
    durationMs: meta.durationMs,
    finished: meta.finished,
  };
  const tx = (await openDb()).transaction(META, "readwrite");
  tx.objectStore(META).put(record);
  await done(tx);
}

export async function putChunk(key: string, seq: number, data: Blob) {
  const tx = (await openDb()).transaction(CHUNKS, "readwrite");
  tx.objectStore(CHUNKS).put({ interviewId: key, seq, data } satisfies ChunkRecord);
  await done(tx);
}

/** 저장된 조각을 순서대로 합친 구간 녹음. 조각이 없으면 null. */
export async function loadRecording(key: string) {
  const db = await openDb();
  const tx = db.transaction([CHUNKS, META], "readonly");
  const [chunks, record] = await Promise.all([
    result(tx.objectStore(CHUNKS).getAll(range(key))) as Promise<ChunkRecord[]>,
    result(tx.objectStore(META).get(key)) as Promise<MetaRecord | undefined>,
  ]);
  if (!chunks.length) return null;
  chunks.sort((a, b) => a.seq - b.seq);
  const mimeType = record?.mimeType ?? chunks[0].data.type ?? "audio/webm";
  return {
    blob: new Blob(chunks.map((c) => c.data), { type: mimeType }),
    meta: record ? toMeta(record) : null,
    chunkCount: chunks.length,
  };
}

export async function listStoredRecordings() {
  const tx = (await openDb()).transaction(META, "readonly");
  const records = (await result(tx.objectStore(META).getAll())) as MetaRecord[];
  return records.map(toMeta);
}

/** 한 면접의 구간들을 시작 순서로 */
export async function listInterviewRecordings(interviewId: string) {
  return (await listStoredRecordings())
    .filter((m) => m.interviewId === interviewId)
    .sort((a, b) => a.startMs - b.startMs);
}

export async function deleteRecording(key: string) {
  const tx = (await openDb()).transaction([CHUNKS, META], "readwrite");
  tx.objectStore(CHUNKS).delete(range(key));
  tx.objectStore(META).delete(key);
  await done(tx);
}

/** 면접의 모든 구간을 지운다 (면접 삭제 시) */
export async function deleteInterviewRecordings(interviewId: string) {
  for (const meta of await listInterviewRecordings(interviewId)) await deleteRecording(meta.key);
}
