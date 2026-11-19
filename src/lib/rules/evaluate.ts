import {
  INVALID_BIRTH_DATE_MESSAGE,
  ageOn,
  formatIsoDate,
  koreanDate,
  monthsOld,
  parseBirthDate,
} from "./dates";
import { formatWon, manwonToWon, parseCount } from "./money";
import {
  UNKNOWN_ANSWER,
  type Answers,
  type EvaluationContext,
  type Evidence,
  type Question,
  type Rule,
  type RuleCheck,
  type RuleResult,
  type RuleStatus,
  type When,
} from "./types";
import { applies, isQuestionVisible } from "./when";

type ReadAnswer = { kind: "missing" } | { kind: "unknown" } | { kind: "value"; value: string };

export type CheckOutcome = {
  status: Exclude<RuleStatus, "NOT_APPLICABLE">;
  reason: string;
  /** 실제 비교에 쓴 기준. 없으면 규칙의 criterion을 쓴다. */
  criterion?: string;
};

function readAnswer(answers: Answers, questionId: string): ReadAnswer {
  const value = (answers[questionId] ?? "").trim();
  if (value === "") return { kind: "missing" };
  if (value === UNKNOWN_ANSWER) return { kind: "unknown" };
  return { kind: "value", value };
}

function findQuestion(questions: readonly Question[], id: string): Question | undefined {
  return questions.find((question) => question.id === id);
}

function labelOf(questions: readonly Question[], id: string): string {
  return findQuestion(questions, id)?.label ?? id;
}

function notAnswered(questions: readonly Question[], id: string, read: ReadAnswer): CheckOutcome {
  const label = labelOf(questions, id);
  return read.kind === "unknown"
    ? {
        status: "UNKNOWN",
        reason: `'${label}'에 모르겠어요를 선택했어요. 확인 방법을 참고해 확인해 주세요.`,
      }
    : { status: "UNKNOWN", reason: `'${label}'을(를) 아직 입력하지 않았어요.` };
}

/** 입력값을 화면에 보여줄 문자열로 바꾼다. */
export function displayAnswer(question: Question | undefined, raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value === "") return "미입력";
  if (value === UNKNOWN_ANSWER) return "모르겠어요";
  if (!question) return value;
  if (question.kind === "choice") {
    return question.options.find((option) => option.value === value)?.label ?? value;
  }
  if (question.kind === "date") return formatIsoDate(value);
  if (question.unit === "만 원") {
    const won = manwonToWon(value);
    return won === null ? value : formatWon(won);
  }
  return `${value}${question.unit}`;
}

function checkAnswer(
  check: Extract<RuleCheck, { type: "answer" }>,
  { questions, answers }: EvaluationContext,
): CheckOutcome {
  const read = readAnswer(answers, check.question);
  if (read.kind !== "value") return notAnswered(questions, check.question, read);
  const outcome = check.outcomes[read.value];
  if (!outcome) {
    return { status: "UNKNOWN", reason: "선택한 답으로는 판단할 수 없어요. 공식 기관에 확인해 주세요." };
  }
  return outcome;
}

function checkBirthYear(
  check: Extract<RuleCheck, { type: "birthYearRange" }>,
  { questions, answers, now }: EvaluationContext,
): CheckOutcome {
  const read = readAnswer(answers, check.question);
  if (read.kind !== "value") return notAnswered(questions, check.question, read);
  const birth = parseBirthDate(read.value, now);
  if (!birth) return { status: "UNKNOWN", reason: INVALID_BIRTH_DATE_MESSAGE };

  const range = `${check.min}~${check.max}년생`;
  return birth.year >= check.min && birth.year <= check.max
    ? { status: "MET", reason: `${birth.year}년생은 기준(${range}) 안으로 보여요.` }
    : { status: "NOT_MET", reason: `${birth.year}년생은 기준(${range}) 밖으로 보여요.` };
}

function checkAgeWindow(
  check: Extract<RuleCheck, { type: "ageWindow" }>,
  { questions, answers, now }: EvaluationContext,
): CheckOutcome {
  const read = readAnswer(answers, check.question);
  if (read.kind !== "value") return notAnswered(questions, check.question, read);
  const birth = parseBirthDate(read.value, now);
  if (!birth) return { status: "UNKNOWN", reason: INVALID_BIRTH_DATE_MESSAGE };

  const today = koreanDate(now);
  const age = ageOn(birth, today);
  if (age < check.minAge) {
    return {
      status: "NOT_MET",
      reason: `만 ${age}세는 기준(만 ${check.minAge}세 이상)보다 어린 것으로 보여요.`,
    };
  }
  if (age <= check.maxAge) {
    return { status: "MET", reason: `만 ${age}세는 기준(만 ${check.minAge}~${check.maxAge}세) 안으로 보여요.` };
  }
  if (!check.extension) {
    return {
      status: "NOT_MET",
      reason: `만 ${age}세는 기준(만 ${check.maxAge}세 이하)을 넘는 것으로 보여요.`,
    };
  }

  const { capAge } = check.extension;
  if (age > capAge) {
    return {
      status: "NOT_MET",
      reason: `만 ${age}세는 병역 기간을 더해도 최대 연령(만 ${capAge}세)을 넘는 것으로 보여요.`,
    };
  }

  const extensionRead = readAnswer(answers, check.extension.question);
  if (extensionRead.kind !== "value") {
    const outcome = notAnswered(questions, check.extension.question, extensionRead);
    return {
      ...outcome,
      reason: `만 ${age}세는 병역 기간에 따라 달라져요. ${outcome.reason}`,
    };
  }
  const serviceMonths = parseCount(extensionRead.value);
  if (serviceMonths === null) {
    return { status: "UNKNOWN", reason: "병역 기간을 0 이상의 개월 수로 입력해 주세요." };
  }

  const limitMonths = Math.min((check.maxAge + 1) * 12 + serviceMonths, (capAge + 1) * 12);
  return monthsOld(birth, today) < limitMonths
    ? {
        status: "MET",
        reason: `만 ${age}세지만 병역 기간 ${serviceMonths}개월을 더하면 기준 안으로 보여요.`,
      }
    : {
        status: "NOT_MET",
        reason: `만 ${age}세는 병역 기간 ${serviceMonths}개월을 더해도 기준을 넘는 것으로 보여요.`,
      };
}

function compareAmount(wonValue: number, limitWon: number, criterion: string): CheckOutcome {
  return wonValue > limitWon
    ? {
        status: "NOT_MET",
        reason: `기준보다 ${formatWon(wonValue - limitWon)} 많은 것으로 보여요.`,
        criterion,
      }
    : { status: "MET", reason: `입력한 ${formatWon(wonValue)}은 기준 이내로 보여요.`, criterion };
}

/** 기준 중위소득 비율 금액(원). 원 미만은 반올림한다. */
export function medianIncomeLimit(median: number, percent: number): number {
  return Math.round((median * percent) / 100);
}

function checkMedianIncome(
  check: Extract<RuleCheck, { type: "medianIncomeRatio" }>,
  { questions, answers }: EvaluationContext,
): CheckOutcome {
  const sizeRead = readAnswer(answers, check.householdSizeQuestion);
  if (sizeRead.kind !== "value") return notAnswered(questions, check.householdSizeQuestion, sizeRead);
  const size = parseCount(sizeRead.value);
  if (size === null || size < 1) {
    return { status: "UNKNOWN", reason: "가구원 수를 1명 이상의 정수로 입력해 주세요." };
  }
  const median = check.table.byHouseholdSize[size];
  if (median === undefined) {
    return {
      status: "UNKNOWN",
      reason: `${size}인 가구의 기준 금액은 이 화면에서 계산하지 않아요. 공식 기관에 확인해 주세요.`,
    };
  }

  const limitWon = medianIncomeLimit(median, check.percent);
  const criterion = `${size}인 가구 ${check.table.year}년 기준 중위소득 ${check.percent}% = 월 ${formatWon(limitWon)}`;

  const read = readAnswer(answers, check.question);
  if (read.kind !== "value") return { ...notAnswered(questions, check.question, read), criterion };
  const won = manwonToWon(read.value);
  if (won === null) {
    return { status: "UNKNOWN", reason: "금액을 0 이상의 숫자로 입력해 주세요.", criterion };
  }

  const outcome = compareAmount(won, limitWon, criterion);
  if (
    outcome.status === "MET" &&
    check.cautionAbovePercent !== undefined &&
    check.caution &&
    won > medianIncomeLimit(median, check.cautionAbovePercent)
  ) {
    return { ...outcome, reason: `${outcome.reason} ${check.caution}` };
  }
  return outcome;
}

function checkMaxAmount(
  check: Extract<RuleCheck, { type: "maxAmount" }>,
  { questions, answers }: EvaluationContext,
): CheckOutcome {
  const criterion = `${formatWon(check.maxWon)} 이하`;
  const read = readAnswer(answers, check.question);
  if (read.kind !== "value") return { ...notAnswered(questions, check.question, read), criterion };
  const won = manwonToWon(read.value);
  if (won === null) {
    return { status: "UNKNOWN", reason: "금액을 0 이상의 숫자로 입력해 주세요.", criterion };
  }
  return compareAmount(won, check.maxWon, criterion);
}

/** 적용 여부(appliesWhen)는 보지 않고 기준만 계산한다. */
export function evaluateCheck(check: RuleCheck, context: EvaluationContext): CheckOutcome {
  switch (check.type) {
    case "answer":
      return checkAnswer(check, context);
    case "birthYearRange":
      return checkBirthYear(check, context);
    case "ageWindow":
      return checkAgeWindow(check, context);
    case "medianIncomeRatio":
      return checkMedianIncome(check, context);
    case "maxAmount":
      return checkMaxAmount(check, context);
  }
}

function inputQuestionIds(check: RuleCheck): string[] {
  switch (check.type) {
    case "medianIncomeRatio":
      return [check.householdSizeQuestion, check.question];
    case "ageWindow":
      return check.extension ? [check.question, check.extension.question] : [check.question];
    default:
      return [check.question];
  }
}

/** 규칙이 주로 묻는 질문 (입력 화면에서 판정 힌트를 붙일 위치) */
export function primaryQuestionId(rule: Rule): string {
  return rule.check.question;
}

function whenQuestionIds(when: When | undefined): string[] {
  if (!when) return [];
  if ("all" in when) return when.all.flatMap(whenQuestionIds);
  if ("any" in when) return when.any.flatMap(whenQuestionIds);
  if ("not" in when) return whenQuestionIds(when.not);
  if ("question" in when) return [when.question];
  return [when.birthDateQuestion];
}

/** 규칙을 판정하는 데 필요한 질문 전부 (기준 질문과 적용 조건 질문). 순서는 고정이다. */
export function ruleInputQuestionIds(rule: Rule): string[] {
  return [...new Set([...inputQuestionIds(rule.check), ...whenQuestionIds(rule.appliesWhen)])];
}

function buildEvidence(rule: Rule, context: EvaluationContext, criterion: string): Evidence {
  const inputs = inputQuestionIds(rule.check)
    .map((id) => findQuestion(context.questions, id))
    .filter((question): question is Question => Boolean(question))
    .filter((question) => isQuestionVisible(question, context.answers, context.now))
    .map((question) => ({
      questionId: question.id,
      label: question.label,
      value: displayAnswer(question, context.answers[question.id]),
    }));

  return {
    inputs,
    criterion,
    references: rule.check.type === "medianIncomeRatio" ? [rule.check.table.source] : [],
  };
}

export function evaluateRule(rule: Rule, context: EvaluationContext): RuleResult {
  const base = {
    ruleId: rule.id,
    label: rule.label,
    source: rule.source,
    verified: rule.verified,
    criterion: rule.criterion,
    plainText: rule.plainText,
    howToCheck: rule.howToCheck,
  };

  if (!applies(rule.appliesWhen, context.answers, context.now)) {
    return {
      ...base,
      status: "NOT_APPLICABLE",
      reason: rule.notApplicableReason ?? "입력한 상황에는 해당하지 않는 조건이에요.",
      evidence: { inputs: [], criterion: rule.criterion, references: [] },
    };
  }

  const outcome = evaluateCheck(rule.check, context);
  return {
    ...base,
    status: outcome.status,
    reason: outcome.reason,
    evidence: buildEvidence(rule, context, outcome.criterion ?? rule.criterion),
  };
}

export function evaluateRules(rules: readonly Rule[], context: EvaluationContext): RuleResult[] {
  return rules.map((rule) => evaluateRule(rule, context));
}
