/** 녹음 파일 경로: interviews/{면접 id}-{구간 시작 ms}[-랜덤 접미사].{확장자} */
export function isRecordingPathname(interviewId: string, pathname: string) {
  const prefix = `interviews/${interviewId}-`;
  return pathname.startsWith(prefix) && /^\d+(-[A-Za-z0-9]+)?\.[a-z0-9]+$/.test(pathname.slice(prefix.length));
}

/** URL이 Vercel Blob의 그 경로를 가리키는지. 클라이언트가 보낸 url을 그대로 믿지 않으려고 쓴다. */
export function isBlobUrlFor(url: string, pathname: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".blob.vercel-storage.com") &&
      decodeURIComponent(parsed.pathname) === `/${pathname}`
    );
  } catch {
    return false;
  }
}

/** 비공개 저장소로 옮기기 전에 공개 저장소에 올라간 파일. URL만으로 열린다. */
export function isPublicBlobUrl(url: string) {
  return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
}
