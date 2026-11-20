import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "청년정책 신청 도우미",
  description: "청년정책 신청이 막힌 이유를 진단하고 다음 행동을 안내해요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
