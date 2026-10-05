import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모의 면접",
  description: "예상 질문 관리와 AI 음성 모의 면접",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
