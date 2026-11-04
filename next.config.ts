import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 지원자 정보는 설정 화면에서 별도 메뉴로 옮겼다.
  async redirects() {
    return [{ source: "/settings/profiles/:path*", destination: "/profiles/:path*", permanent: true }];
  },
  turbopack: {
    resolveAlias: {
      // ebml의 "browser" 엔트리는 전역 변수에 붙는 IIFE라 require 결과가 비어 있다.
      // ts-ebml이 자체 번들에서 하듯 CommonJS 빌드를 쓴다 (녹음 탐색 보정, L-3).
      ebml: { browser: "ebml/lib/ebml.js" },
    },
  },
};

export default nextConfig;
