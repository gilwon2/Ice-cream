import type { Advisory, Policy, QuestionGroup, RequiredDocument } from "@/data/policies";
import {
  applicationState,
  applies,
  evaluateRules,
  isQuestionVisible,
  matchWhen,
  type Answers,
  type ApplicationState,
  type EvaluationContext,
  type Question,
  type RuleResult,
} from "@/lib/rules";

export type Blocker = "documents" | "eligibility" | "unclear";

export type DiagnosisInput = {
  policy: Policy;
  blocker: Blocker | null;
  answers: Answers;
  checkedDocumentIds: string[];
  inquiryResolved: boolean;
  now: Date;
};

export type Route = "INELIGIBLE" | "NEEDS_INQUIRY" | "ACTION_REQUIRED" | "READY";

export type ProgressItem = {
  id: string;
  label: string;
  state: "done" | "blocked" | "todo";
};

export type Diagnosis = {
  /** 모든 규칙의 판정. 해당 없는 조건(NOT_APPLICABLE)도 포함한다. */
  conditions: RuleResult[];
  documents: RequiredDocument[];
  missingDocuments: RequiredDocument[];
  items: ProgressItem[];
  percent: number;
  remaining: number;
  route: Route;
  application: ApplicationState;
  canApply: boolean;
  advisories: Advisory[];
};

export function evaluationContext(policy: Policy, answers: Answers, now: Date): EvaluationContext {
  return { questions: policy.questions, answers, now };
}

/** 확인되지 않은 기준의 미충족은 확정하지 않고 확인 필요로 본다. */
function isConfirmedNotMet(condition: RuleResult): boolean {
  return condition.status === "NOT_MET" && condition.verified;
}

function progressState(condition: RuleResult): ProgressItem["state"] {
  if (condition.status === "MET") return "done";
  if (condition.status === "NOT_MET") return "blocked";
  return "todo";
}

export function diagnose(input: DiagnosisInput): Diagnosis {
  const { policy, blocker, answers, checkedDocumentIds, inquiryResolved, now } = input;
  const context = evaluationContext(policy, answers, now);

  const conditions = evaluateRules(policy.rules, context);
  const applicable = conditions.filter((condition) => condition.status !== "NOT_APPLICABLE");
  const documents = policy.documents.filter((document) =>
    applies(document.appliesWhen, answers, now),
  );
  const missingDocuments = documents.filter(
    (document) => !checkedDocumentIds.includes(document.id),
  );
  const inquiryPending = blocker === "unclear" && !inquiryResolved;

  const items: ProgressItem[] = [
    ...applicable.map((condition) => ({
      id: condition.ruleId,
      label: condition.label,
      state: progressState(condition),
    })),
    ...(blocker === "unclear"
      ? [
          {
            id: "inquiry",
            label: "공식 기관 확인",
            state: inquiryResolved ? ("done" as const) : ("todo" as const),
          },
        ]
      : []),
    ...documents.map((document) => ({
      id: document.id,
      label: document.label,
      state: checkedDocumentIds.includes(document.id) ? ("done" as const) : ("todo" as const),
    })),
  ];

  const doneCount = items.filter((item) => item.state === "done").length;
  const percent = items.length === 0 ? 0 : Math.floor((doneCount / items.length) * 100);

  let route: Route = "READY";
  if (applicable.some(isConfirmedNotMet)) {
    route = "INELIGIBLE";
  } else if (inquiryPending || applicable.some((condition) => condition.status !== "MET")) {
    route = "NEEDS_INQUIRY";
  } else if (missingDocuments.length > 0) {
    route = "ACTION_REQUIRED";
  }

  const application = applicationState(policy.application, now);

  return {
    conditions,
    documents,
    missingDocuments,
    items,
    percent,
    remaining: items.length - doneCount,
    route,
    application,
    canApply: route === "READY" && percent === 100 && application.status === "open",
    // 안내는 조건이 확실히 참일 때만 띄운다.
    advisories: policy.advisories.filter(
      (advisory) => matchWhen(advisory.appliesWhen, answers, now) === true,
    ),
  };
}

/**
 * 기관 문의문을 보여줄지 정한다.
 * "조건이 애매해요"를 골랐거나, 판정 결과가 추가 확인 필요이면 보여준다.
 * 확인된 기준에 맞지 않는 경우(INELIGIBLE)에는 문의문 대신 개선 제안문을 보여준다.
 */
export function shouldShowInquiry(blocker: Blocker | null, route: Route): boolean {
  if (route === "INELIGIBLE") return false;
  return blocker === "unclear" || route === "NEEDS_INQUIRY";
}

export type QuestionPage = {
  group: QuestionGroup;
  questions: Question[];
};

/** 지금 답에 해당하는 질문만 남기고, 빈 묶음은 뺀다. */
export function questionPages(policy: Policy, answers: Answers, now: Date): QuestionPage[] {
  return policy.questionGroups
    .map((group) => ({
      group,
      questions: group.questionIds
        .map((id) => policy.questions.find((question) => question.id === id))
        .filter((question): question is Question => Boolean(question))
        .filter((question) => isQuestionVisible(question, answers, now)),
    }))
    .filter((page) => page.questions.length > 0);
}
