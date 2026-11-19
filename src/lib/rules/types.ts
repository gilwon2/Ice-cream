/** "모르겠어요"를 고른 답의 값. 빈 문자열은 아직 답하지 않았다는 뜻이다. */
export const UNKNOWN_ANSWER = "unknown";

export type Answers = Readonly<Record<string, string | undefined>>;

export type Source = {
  name: string;
  url: string;
  /** 게시일 또는 최종 수정일 (YYYY-MM-DD) */
  publishedAt?: string;
};

export type ChoiceOption = { value: string; label: string };

/**
 * 질문과 규칙이 언제 적용되는지 나타내는 조건.
 * 판단할 수 없는 입력(미입력, 모르겠어요)은 "알 수 없음"으로 계산한다.
 */
export type When =
  | { question: string; in: readonly string[] }
  | { birthDateQuestion: string; ageAtLeast: number }
  | { birthDateQuestion: string; ageBelow: number }
  | { all: readonly When[] }
  | { any: readonly When[] }
  | { not: When };

type QuestionBase = {
  id: string;
  label: string;
  help?: string;
  /** true이면 "모르겠어요"를 고를 수 있다. */
  allowUnknown?: boolean;
  /** 조건이 거짓일 때만 질문을 숨긴다. 알 수 없으면 보여준다. */
  appliesWhen?: When;
};

export type Question =
  | (QuestionBase & { kind: "choice"; options: readonly ChoiceOption[] })
  | (QuestionBase & { kind: "number"; unit: string; integer?: boolean; placeholder?: string })
  | (QuestionBase & { kind: "date" });

export type RuleStatus = "MET" | "NOT_MET" | "UNKNOWN" | "NOT_APPLICABLE";

export type AnswerOutcome = { status: "MET" | "NOT_MET"; reason: string };

export type MedianIncomeTable = {
  year: number;
  /** 가구원 수별 월 기준 중위소득(원) */
  byHouseholdSize: Readonly<Record<number, number>>;
  source: Source;
};

export type RuleCheck =
  | {
      type: "answer";
      question: string;
      /** 답 값별로 사람이 검수한 판정. 목록에 없는 답은 판단하지 않는다. */
      outcomes: Readonly<Record<string, AnswerOutcome>>;
    }
  | { type: "birthYearRange"; question: string; min: number; max: number }
  | {
      type: "ageWindow";
      question: string;
      minAge: number;
      maxAge: number;
      /** 병역 기간(개월)만큼 상한을 늘리되 capAge세를 넘지 않는다. */
      extension?: { question: string; capAge: number };
    }
  | {
      type: "medianIncomeRatio";
      question: string;
      householdSizeQuestion: string;
      percent: number;
      table: MedianIncomeTable;
      /** 충족하더라도 이 비율을 넘으면 caution 문구를 덧붙인다. */
      cautionAbovePercent?: number;
      caution?: string;
    }
  | { type: "maxAmount"; question: string; maxWon: number };

export type Rule = {
  id: string;
  label: string;
  /** 화면에 보여줄 기준 요약 */
  criterion: string;
  /** 사람이 검수한 쉬운 뜻 */
  plainText: string;
  /** 사람이 검수한 확인 방법 */
  howToCheck: readonly string[];
  /** 공고 원문으로 확인한 기준이면 true */
  verified: boolean;
  source: Source;
  appliesWhen?: When;
  notApplicableReason?: string;
  check: RuleCheck;
};

export type EvidenceInput = { questionId: string; label: string; value: string };

export type Evidence = {
  inputs: EvidenceInput[];
  /** 실제 비교에 쓴 기준 (예: 1인 가구 기준 중위소득 60% = 월 153만 8,543원) */
  criterion: string;
  references: Source[];
};

export type RuleResult = {
  ruleId: string;
  label: string;
  status: RuleStatus;
  reason: string;
  evidence: Evidence;
  source: Source;
  verified: boolean;
  criterion: string;
  plainText: string;
  howToCheck: readonly string[];
};

export type EvaluationContext = {
  questions: readonly Question[];
  answers: Answers;
  now: Date;
};
