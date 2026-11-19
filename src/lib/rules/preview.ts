import { birthDateForAge } from "./dates";
import { evaluateCheck, medianIncomeLimit } from "./evaluate";
import { formatManwon, formatWon, parseCount } from "./money";
import {
  UNKNOWN_ANSWER,
  type EvaluationContext,
  type Question,
  type Rule,
  type RuleCheck,
  type RuleStatus,
} from "./types";

export type OutcomePreview = {
  /** 예시 답을 사람이 읽을 수 있게 쓴 것 */
  label: string;
  /** 이 판정을 만드는 답. "해당 없음"은 빈 객체다. */
  answers: Record<string, string>;
  status: RuleStatus;
  reason: string;
};

type Scenario = { label: string; answers: Record<string, string> };

function questionOf(context: EvaluationContext, id: string): Question | undefined {
  return context.questions.find((question) => question.id === id);
}

function amountScenarios(
  questionId: string,
  limitWon: number,
  extra: Record<string, string> = {},
): Scenario[] {
  return [
    {
      label: `${formatWon(limitWon)} (기준과 같음)`,
      answers: { ...extra, [questionId]: formatManwon(limitWon) },
    },
    {
      label: `${formatWon(limitWon + 1)} (기준보다 1원 많음)`,
      answers: { ...extra, [questionId]: formatManwon(limitWon + 1) },
    },
  ];
}

function valueScenarios(check: RuleCheck, context: EvaluationContext): Scenario[] {
  switch (check.type) {
    case "answer": {
      const question = questionOf(context, check.question);
      const options =
        question?.kind === "choice"
          ? question.options
          : Object.keys(check.outcomes).map((value) => ({ value, label: value }));
      return options.map((option) => ({
        label: option.label,
        answers: { [check.question]: option.value },
      }));
    }

    case "birthYearRange":
      return [
        { label: `${check.min - 1}년생`, answers: { [check.question]: `${check.min - 1}-12-31` } },
        { label: `${check.min}년생`, answers: { [check.question]: `${check.min}-01-01` } },
        { label: `${check.max}년생`, answers: { [check.question]: `${check.max}-12-31` } },
        { label: `${check.max + 1}년생`, answers: { [check.question]: `${check.max + 1}-01-01` } },
      ];

    case "ageWindow": {
      const ages = [check.minAge - 1, check.minAge, check.maxAge, check.maxAge + 1];
      if (check.extension) ages.push(check.extension.capAge + 1);
      return ages.map((age) => ({
        label: `만 ${age}세`,
        answers: { [check.question]: birthDateForAge(age, context.now) },
      }));
    }

    case "medianIncomeRatio": {
      const answered = parseCount(context.answers[check.householdSizeQuestion] ?? "");
      const size =
        answered !== null && check.table.byHouseholdSize[answered] !== undefined ? answered : 1;
      const limit = medianIncomeLimit(check.table.byHouseholdSize[size], check.percent);
      return amountScenarios(check.question, limit, {
        [check.householdSizeQuestion]: String(size),
      }).map((scenario) => ({ ...scenario, label: `${size}인 가구, 월 ${scenario.label}` }));
    }

    case "maxAmount":
      return amountScenarios(check.question, check.maxWon);
  }
}

/**
 * 규칙 하나에 대해 가능한 답별 판정을 미리 계산한다.
 * 예시 답 → 모르겠어요(허용 시) → 미입력 → 해당 없음(적용 조건이 있을 때) 순서다.
 */
export function previewOutcomes(rule: Rule, context: EvaluationContext): OutcomePreview[] {
  const question = questionOf(context, rule.check.question);
  const scenarios: Scenario[] = [
    ...valueScenarios(rule.check, context),
    ...(question?.allowUnknown
      ? [{ label: "모르겠어요", answers: { [rule.check.question]: UNKNOWN_ANSWER } }]
      : []),
    { label: "미입력", answers: { [rule.check.question]: "" } },
  ];

  const previews: OutcomePreview[] = scenarios.map(({ label, answers }) => {
    const outcome = evaluateCheck(rule.check, {
      ...context,
      answers: { ...context.answers, ...answers },
    });
    return { label, answers, status: outcome.status, reason: outcome.reason };
  });

  if (rule.appliesWhen) {
    previews.push({
      label: "해당 없음",
      answers: {},
      status: "NOT_APPLICABLE",
      reason: rule.notApplicableReason ?? "입력한 상황에는 해당하지 않는 조건이에요.",
    });
  }
  return previews;
}
