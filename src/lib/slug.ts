/** 제목 텍스트 → 앵커 id. 글자·숫자(한글 포함)만 남기고 나머지는 하이픈 하나로 합친다. 문서 목차와 렌더러가 같이 쓴다. */
export function headingSlug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
