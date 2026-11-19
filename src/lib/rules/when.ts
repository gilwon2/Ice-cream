import { ageOn, koreanDate, parseBirthDate } from "./dates";
import { UNKNOWN_ANSWER, type Answers, type Question, type When } from "./types";

/**
 * 조건을 계산한다. 판단할 수 없으면 null을 돌려준다.
 * null은 "알 수 없음"이므로 질문과 규칙은 보수적으로 적용된 것으로 본다.
 */
export function matchWhen(when: When, answers: Answers, now: Date): boolean | null {
  if ("all" in when) {
    const results = when.all.map((item) => matchWhen(item, answers, now));
    if (results.includes(false)) return false;
    return results.includes(null) ? null : true;
  }
  if ("any" in when) {
    const results = when.any.map((item) => matchWhen(item, answers, now));
    if (results.includes(true)) return true;
    return results.includes(null) ? null : false;
  }
  if ("not" in when) {
    const result = matchWhen(when.not, answers, now);
    return result === null ? null : !result;
  }
  if ("question" in when) {
    const answer = answers[when.question] ?? "";
    if (answer === "") return null;
    // "모르겠어요"는 조건에 명시했을 때만 일치로 보고, 아니면 알 수 없음이다.
    if (answer === UNKNOWN_ANSWER && !when.in.includes(UNKNOWN_ANSWER)) return null;
    return when.in.includes(answer);
  }

  const birth = parseBirthDate(answers[when.birthDateQuestion] ?? "", now);
  if (!birth) return null;
  const age = ageOn(birth, koreanDate(now));
  return "ageAtLeast" in when ? age >= when.ageAtLeast : age < when.ageBelow;
}

/** 조건이 확실히 거짓일 때만 false다. */
export function applies(when: When | undefined, answers: Answers, now: Date): boolean {
  return !when || matchWhen(when, answers, now) !== false;
}

export function isQuestionVisible(question: Question, answers: Answers, now: Date): boolean {
  return applies(question.appliesWhen, answers, now);
}
