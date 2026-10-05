// L-9: 녹음 조각을 IndexedDB에 면접 ID 단위로 쌓아, 브라우저가 죽어도 다음 접속 때 복구한다(L-10).

const DB_NAME = "interview-recordings";
const DB_VERSION = 1;
const CHUNKS = "chunks";
const META = "meta";

export type RecordingMeta = {
  interviewId: string;
  mimeType: string;
  startedAt: number;
  /** 녹음 기준 시계로 잰 길이. 정상 종료 시에만 기록된다. */
  durationMs?: number;
  finished: boolean;
};

type ChunkRecord = { interviewId: string; seq: number; data: Blob };

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

const range = (interviewId: string) =>
  IDBKeyRange.bound([interviewId, 0], [interviewId, Number.MAX_SAFE_INTEGER]);

export async function putMeta(meta: RecordingMeta) {
  const tx = (await openDb()).transaction(META, "readwrite");
  tx.objectStore(META).put(meta);
  await done(tx);
}

export async function getMeta(interviewId: string) {
  const tx = (await openDb()).transaction(META, "readonly");
  return (await result(tx.objectStore(META).get(interviewId))) as RecordingMeta | undefined;
}

export async function putChunk(interviewId: string, seq: number, data: Blob) {
  const tx = (await openDb()).transaction(CHUNKS, "readwrite");
  tx.objectStore(CHUNKS).put({ interviewId, seq, data } satisfies ChunkRecord);
  await done(tx);
}

/** 저장된 조각을 순서대로 합친 녹음. 조각이 없으면 null. */
export async function loadRecording(interviewId: string) {
  const db = await openDb();
  const tx = db.transaction([CHUNKS, META], "readonly");
  const [chunks, meta] = await Promise.all([
    result(tx.objectStore(CHUNKS).getAll(range(interviewId))) as Promise<ChunkRecord[]>,
    result(tx.objectStore(META).get(interviewId)) as Promise<RecordingMeta | undefined>,
  ]);
  if (!chunks.length) return null;
  chunks.sort((a, b) => a.seq - b.seq);
  const mimeType = meta?.mimeType ?? chunks[0].data.type ?? "audio/webm";
  return { blob: new Blob(chunks.map((c) => c.data), { type: mimeType }), meta };
}

export async function listStoredRecordings() {
  const tx = (await openDb()).transaction(META, "readonly");
  return (await result(tx.objectStore(META).getAll())) as RecordingMeta[];
}

export async function deleteRecording(interviewId: string) {
  const tx = (await openDb()).transaction([CHUNKS, META], "readwrite");
  tx.objectStore(CHUNKS).delete(range(interviewId));
  tx.objectStore(META).delete(interviewId);
  await done(tx);
}
