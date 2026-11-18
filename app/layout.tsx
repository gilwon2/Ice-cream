import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { StepHeader } from "@/components/step-header";

export const metadata: Metadata = {
  title: "혜택진단",
  description: "청년이 정책 혜택을 받지 못하는 원인을 찾아 주는 프로토타입",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col antialiased">
        <StepHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
        <footer className="border-t px-4 py-5 text-center text-xs text-muted-foreground">
          프로토타입입니다. 정책 정보는 모두 가상 데이터이며 실제 신청이 이루어지지 않습니다.
        </footer>
      </body>
    </html>
  );
}
