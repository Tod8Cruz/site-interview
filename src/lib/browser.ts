// N-4: 모의 면접 진행은 데스크톱 Chrome 전용이다.
export function isDesktopChrome() {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const data = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[]; mobile: boolean } })
    .userAgentData;
  if (data) return !data.mobile && data.brands.some((b) => b.brand === "Google Chrome");
  return /Chrome\//.test(ua) && !/Edg\/|OPR\/|SamsungBrowser|Mobile|Android/.test(ua);
}
