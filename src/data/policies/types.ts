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

/**
 * 온통청년 API로 "비슷한 청년정책"을 찾을 때 쓰는 분류.
 * 추천에만 쓰고 자격 판정에는 쓰지 않는다. 요청에는 이 분류만 넣고 사용자 입력값은 넣지 않는다.
 */
export type RecommendationCategory = {
  /** 정책대분류명 (코드정의서의 lclsfNm 값) */
  lclsfNm: string;
  /** 정책중분류명 (코드정의서의 mclsfNm 값). 응답을 다시 거를 때 쓴다. */
  mclsfNm: string;
  /**
   * 요청에 보낼 중분류 검색어. 온통청년 서버는 공백이 든 중분류명
   * (예: "전월세 및 주거급여 지원")을 보내면 항상 0건을 돌려줘서(2026-11-20 확인)
   * 공백 없는 부분 검색어를 따로 둔다.
   */
  mclsfQuery: string;
  /**
   * 지금 진단 중인 정책과 같은 정책으로 볼 이름(공백 없이). 공백을 뺀 정책명이 이 이름으로 시작하면 뺀다.
   * "구미형 청년월세 지원사업"처럼 앞에 지역명이 붙은 지자체 자체 사업은 다른 정책으로 보고 남긴다.
   */
  samePolicyNames: readonly string[];
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
  /** 비슷한 청년정책 추천용 분류 */
  recommendation: RecommendationCategory;
  /** 자격 미충족 시 판정 없이 안내만 하는 대안 */
  alternative?: {
    title: string;
    body: readonly string[];
    link: ExternalSite;
    source: Source;
  };
};
