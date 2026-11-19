import { formatKoreanDateTime } from "./dates";

export type ApplicationWindow =
  | { kind: "always" }
  | {
      kind: "period";
      /** ISO 시각 (예: 2026-03-30T09:00:00+09:00) */
      start: string;
      end: string;
      /** 마감 후 보여줄 제목 (예: 2026년 접수 마감) */
      closedTitle: string;
    };

export type ApplicationState = {
  status: "open" | "upcoming" | "closed";
  title: string;
  label: string;
};

export function applicationState(window: ApplicationWindow, now: Date): ApplicationState {
  if (window.kind === "always") {
    return { status: "open", title: "상시 신청", label: "상시 신청" };
  }

  const start = formatKoreanDateTime(window.start);
  const end = formatKoreanDateTime(window.end);
  const time = now.getTime();

  if (time < new Date(window.start).getTime()) {
    return { status: "upcoming", title: "접수 예정", label: `${start}부터 접수` };
  }
  if (time > new Date(window.end).getTime()) {
    return { status: "closed", title: window.closedTitle, label: `${start} ~ ${end} (마감)` };
  }
  return { status: "open", title: "접수 중", label: `${end}까지 접수` };
}
