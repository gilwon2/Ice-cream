import type { ApplicationWindow, Question, Rule, Source, When } from "@/lib/rules";

export type ExternalSite = {
  name: string;
  url: string;
};

export type RequiredDocument = {
  id: string;
  label: string;
  /** 온라인 발급처가 있는 서류만 값을 가진다. */
  issuer?: ExternalSite;
  /** 준비 방법 안내 */
  guide: string;
  appliesWhen?: When;
};

/** 입력 화면 한 쪽에 묶어 보여줄 질문 (3~4개) */
export type QuestionGroup = {
  id: string;
  title: string;
  description?: string;
  questionIds: readonly string[];
};

/** 판정과 별개로 보여줄 주의 안내 */
export type Advisory = {
  id: string;
  appliesWhen: When;
  text: string;
  source: Source;
};

export type Policy = {
  id: string;
  name: string;
  field: string;
  summary: string;
  benefit: string;
  /** 판정 기준으로 삼은 공고 */
  announcement: {
    title: string;
    publishedAt: string;
    url: string;
    /** 이 프로젝트에서 공고 내용을 확인한 날 */
    checkedAt: string;
  };
  application: ApplicationWindow;
  /** 접수 마감 시 보여줄 다음 공고 대비 안내 */
  closedGuide?: readonly string[];
  applyMethod: string;
  apply: ExternalSite;
  contact?: string;
  questions: readonly Question[];
  questionGroups: readonly QuestionGroup[];
  rules: readonly Rule[];
  /** 제출서류 목록의 출처 */
  documentsSource: Source;
  /** 서류 목록을 전국 공고 원문으로 확인했으면 true */
  documentsVerified: boolean;
  documents: readonly RequiredDocument[];
  advisories: readonly Advisory[];
  /** 자격 미충족 시 판정 없이 안내만 하는 대안 */
  alternative?: {
    title: string;
    body: readonly string[];
    link: ExternalSite;
    source: Source;
  };
};
