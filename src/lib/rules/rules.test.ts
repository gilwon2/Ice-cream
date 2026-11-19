import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UNKNOWN_ANSWER,
  ageOn,
  applicationState,
  birthDateForAge,
  birthYearGroups,
  composeDate,
  daysInMonth,
  describeBirthDate,
  evaluateRule,
  formatDateDigits,
  splitDateText,
  formatManwon,
  formatWon,
  koreanDate,
  manwonToWon,
  matchWhen,
  medianIncomeLimit,
  parseBirthDate,
  previewOutcomes,
  type EvaluationContext,
  type MedianIncomeTable,
  type Question,
  type Rule,
} from "./index";

const NOW = new Date("2026-11-19T12:00:00+09:00");

const TABLE: MedianIncomeTable = {
  year: 2026,
  byHouseholdSize: { 1: 2_564_238, 2: 4_199_292 },
  source: { name: "테스트 중위소득", url: "https://example.org/median" },
};

const SOURCE = { name: "테스트 공고", url: "https://example.org/notice" };

const QUESTIONS: Question[] = [
  { id: "birth", kind: "date", label: "생년월일" },
  {
    id: "house",
    kind: "choice",
    label: "주택 소유",
    options: [
      { value: "yes", label: "예" },
      { value: "no", label: "아니오" },
    ],
    allowUnknown: true,
  },
  { id: "size", kind: "number", label: "가구원 수", unit: "명", integer: true },
  { id: "income", kind: "number", label: "월소득", unit: "만 원", allowUnknown: true },
  { id: "military", kind: "number", label: "병역 기간", unit: "개월", allowUnknown: true },
];

function rule(check: Rule["check"], extra: Partial<Rule> = {}): Rule {
  return {
    id: "test-rule",
    label: "테스트 조건",
    criterion: "테스트 기준",
    plainText: "쉬운 뜻",
    howToCheck: ["확인 방법"],
    verified: true,
    source: SOURCE,
    check,
    ...extra,
  };
}

function context(answers: Record<string, string>, now = NOW): EvaluationContext {
  return { questions: QUESTIONS, answers, now };
}

const houseRule = rule({
  type: "answer",
  question: "house",
  outcomes: {
    no: { status: "MET", reason: "무주택" },
    yes: { status: "NOT_MET", reason: "유주택" },
  },
});

const incomeRule = rule({
  type: "medianIncomeRatio",
  question: "income",
  householdSizeQuestion: "size",
  percent: 60,
  table: TABLE,
});

const ageRule = rule({
  type: "ageWindow",
  question: "birth",
  minAge: 15,
  maxAge: 34,
  extension: { question: "military", capAge: 37 },
});

describe("금액", () => {
  it("만 원 입력을 원 단위로 바꾸고 다시 오차 없이 표시한다", () => {
    expect(manwonToWon("153.8543")).toBe(1_538_543);
    expect(formatManwon(1_538_543)).toBe("153.8543");
    expect(manwonToWon("-1")).toBeNull();
  });

  it("원 금액을 읽기 쉽게 표시한다", () => {
    expect(formatWon(1_538_543)).toBe("153만 8,543원");
    expect(formatWon(1_500_000)).toBe("150만 원");
    expect(formatWon(122_000_000)).toBe("1억 2,200만 원");
    expect(formatWon(500_000_000)).toBe("5억 원");
    expect(formatWon(1)).toBe("1원");
    expect(formatWon(0)).toBe("0원");
  });

  it("중위소득 비율 금액은 원 미만을 반올림한다", () => {
    expect(medianIncomeLimit(2_564_238, 60)).toBe(1_538_543);
    expect(medianIncomeLimit(4_199_292, 60)).toBe(2_519_575);
  });
});

describe("날짜", () => {
  it("한국 시간 기준 날짜를 쓴다", () => {
    expect(koreanDate(new Date("2026-11-18T15:30:00Z"))).toEqual({ year: 2026, month: 11, day: 19 });
  });

  it("생일 전날까지는 나이가 오르지 않는다", () => {
    const today = koreanDate(NOW);
    expect(ageOn({ year: 1996, month: 11, day: 19 }, today)).toBe(30);
    expect(ageOn({ year: 1996, month: 11, day: 20 }, today)).toBe(29);
  });

  it("존재하지 않거나 미래인 생년월일은 받지 않는다", () => {
    expect(parseBirthDate("2001-02-29", NOW)).toBeNull();
    expect(parseBirthDate("2027-01-01", NOW)).toBeNull();
    expect(parseBirthDate("2000-02-29", NOW)).not.toBeNull();
  });

  it("2월 29일 기준 나이용 생년월일은 28일로 맞춘다", () => {
    expect(birthDateForAge(1, new Date("2028-02-29T12:00:00+09:00"))).toBe("2027-02-28");
  });
});

describe("생년월일 입력", () => {
  it.each([
    ["", ""],
    ["1999", "1999"],
    ["19990", "1999-0"],
    ["199903", "1999-03"],
    ["1999031", "1999-03-1"],
    ["19990315", "1999-03-15"],
    ["199903151", "1999-03-15"],
    ["1999-03-15", "1999-03-15"],
    ["1999.03.15", "1999-03-15"],
    ["19a99", "1999"],
  ])("'%s' 입력은 '%s'로 보인다", (input, shown) => {
    expect(formatDateDigits(input)).toBe(shown);
  });

  describe("만 나이 경계값 (오늘 2026-11-19)", () => {
    it.each([
      ["19991120", 26, "생일 전날"],
      ["19991119", 27, "생일 당일"],
      ["19991118", 27, "생일 다음 날"],
      ["20261119", 0, "오늘 태어남"],
    ])("%s는 만 %i세다 (%s)", (input, age) => {
      expect(describeBirthDate(input, NOW)).toMatchObject({ kind: "valid", age });
    });

    it("출생연도를 함께 돌려준다", () => {
      expect(describeBirthDate("1999-03-15", NOW)).toEqual({
        kind: "valid",
        iso: "1999-03-15",
        age: 27,
        year: 1999,
      });
    });

    it("2월 29일생은 평년에 3월 1일부터 나이가 오른다", () => {
      const on = (date: string) => new Date(`${date}T12:00:00+09:00`);
      expect(describeBirthDate("20000229", on("2026-02-28"))).toMatchObject({ age: 25 });
      expect(describeBirthDate("20000229", on("2026-03-01"))).toMatchObject({ age: 26 });
    });
  });

  it.each([
    ["19990231", "2월 31일"],
    ["19990229", "평년 2월 29일"],
    ["19991301", "13월"],
    ["19990001", "0월"],
    ["19990100", "0일"],
    ["19990431", "4월 31일"],
    ["20261120", "내일 (미래)"],
    ["20270101", "내년 (미래)"],
    ["18991231", "1900년 이전"],
  ])("%s는 올바르지 않은 날짜다 (%s)", (input) => {
    expect(describeBirthDate(input, NOW)).toEqual({ kind: "invalid" });
  });

  it("비어 있거나 8자리가 안 되면 아직 판단하지 않는다", () => {
    expect(describeBirthDate("", NOW)).toEqual({ kind: "empty" });
    expect(describeBirthDate("1999-03", NOW)).toEqual({ kind: "incomplete" });
  });

  it.each([
    [2024, 2, 29],
    [2026, 2, 28],
    [1900, 2, 28],
    [2000, 2, 29],
    [2026, 4, 30],
    [2026, 12, 31],
  ])("%i년 %i월은 %i일까지다", (year, month, days) => {
    expect(daysInMonth(year, month)).toBe(days);
  });

  it("연도를 고르기 전에는 2월도 29일까지 고를 수 있다", () => {
    expect(daysInMonth(null, 2)).toBe(29);
    expect(daysInMonth(null, 1)).toBe(31);
  });

  it("출생연도 목록은 2011년부터 1960년까지 내려가고, 이후 연도는 따로 묶는다", () => {
    const [main, later] = birthYearGroups(NOW);
    expect(main.years[0]).toBe(2011);
    expect(main.years.at(-1)).toBe(1960);
    expect(main.years.indexOf(2000)).toBeLessThan(15);
    expect(later.years).toEqual([2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  });

  it("직접 입력값을 선택 입력의 연·월·일로 나누고 다시 합친다", () => {
    expect(splitDateText("1999-03-15", NOW)).toEqual({ year: "1999", month: "3", day: "15" });
    expect(splitDateText("1999-03", NOW)).toEqual({ year: "1999", month: "3", day: "" });
    expect(splitDateText("1999-02-31", NOW)).toEqual({ year: "1999", month: "2", day: "" });
    expect(splitDateText("1950-01-01", NOW)).toEqual({ year: "", month: "1", day: "1" });
    expect(composeDate({ year: "1999", month: "3", day: "5" })).toBe("1999-03-05");
    expect(composeDate({ year: "1999", month: "3", day: "" })).toBe("");
  });
});

describe("적용 조건 (appliesWhen)", () => {
  const under30 = { birthDateQuestion: "birth", ageBelow: 30 } as const;

  it("판단할 수 없으면 null이다", () => {
    expect(matchWhen(under30, {}, NOW)).toBeNull();
    expect(matchWhen({ question: "house", in: ["yes"] }, { house: UNKNOWN_ANSWER }, NOW)).toBeNull();
  });

  it("모르겠어요를 조건에 넣으면 일치로 본다", () => {
    expect(
      matchWhen({ question: "house", in: ["no", UNKNOWN_ANSWER] }, { house: UNKNOWN_ANSWER }, NOW),
    ).toBe(true);
  });

  it("all은 하나라도 거짓이면 거짓, any는 하나라도 참이면 참이다", () => {
    const answers = { birth: "2000-01-01", house: "no" };
    expect(matchWhen({ all: [under30, { question: "house", in: ["yes"] }] }, answers, NOW)).toBe(false);
    expect(matchWhen({ any: [under30, { question: "size", in: ["1"] }] }, answers, NOW)).toBe(true);
    expect(matchWhen({ not: under30 }, answers, NOW)).toBe(false);
  });

  it("적용되지 않는 규칙은 NOT_APPLICABLE과 사유를 돌려준다", () => {
    const result = evaluateRule(
      { ...houseRule, appliesWhen: under30, notApplicableReason: "30세 이상은 보지 않아요" },
      context({ birth: "1990-01-01", house: "yes" }),
    );
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.reason).toBe("30세 이상은 보지 않아요");
  });
});

describe("판정 결과 구조", () => {
  it("ruleId, status, reason, evidence, source를 담는다", () => {
    const result = evaluateRule(incomeRule, context({ size: "1", income: "150" }));
    expect(result).toMatchObject({
      ruleId: "test-rule",
      status: "MET",
      reason: "입력한 150만 원은 기준 이내로 보여요.",
      source: SOURCE,
      verified: true,
      evidence: {
        inputs: [
          { questionId: "size", label: "가구원 수", value: "1명" },
          { questionId: "income", label: "월소득", value: "150만 원" },
        ],
        criterion: "1인 가구 2026년 기준 중위소득 60% = 월 153만 8,543원",
        references: [TABLE.source],
      },
    });
  });

  it("기준 금액과 같으면 충족, 1원이라도 많으면 미충족이다", () => {
    expect(evaluateRule(incomeRule, context({ size: "1", income: "153.8543" })).status).toBe("MET");
    const over = evaluateRule(incomeRule, context({ size: "1", income: "153.8544" }));
    expect(over.status).toBe("NOT_MET");
    expect(over.reason).toBe("기준보다 1원 많은 것으로 보여요.");
  });

  it("표에 없는 가구원 수는 판단하지 않는다", () => {
    expect(evaluateRule(incomeRule, context({ size: "3", income: "100" })).status).toBe("UNKNOWN");
  });

  it("모르겠어요와 미입력은 UNKNOWN이고 사유가 다르다", () => {
    const unknown = evaluateRule(houseRule, context({ house: UNKNOWN_ANSWER }));
    const missing = evaluateRule(houseRule, context({}));
    expect(unknown.status).toBe("UNKNOWN");
    expect(unknown.reason).toContain("모르겠어요");
    expect(unknown.evidence.inputs[0].value).toBe("모르겠어요");
    expect(missing.status).toBe("UNKNOWN");
    expect(missing.reason).toContain("아직 입력하지 않았어요");
  });
});

describe("previewOutcomes", () => {
  it("선택형 규칙은 보기별, 모르겠어요, 미입력 판정을 순서대로 돌려준다", () => {
    const previews = previewOutcomes(houseRule, context({}));
    expect(previews.map(({ label, status }) => [label, status])).toEqual([
      ["예", "NOT_MET"],
      ["아니오", "MET"],
      ["모르겠어요", "UNKNOWN"],
      ["미입력", "UNKNOWN"],
    ]);
    expect(previews[0]).toMatchObject({ answers: { house: "yes" }, reason: "유주택" });
  });

  it("적용 조건이 있으면 마지막에 해당 없음을 붙인다", () => {
    const previews = previewOutcomes(
      { ...houseRule, appliesWhen: { question: "size", in: ["1"] }, notApplicableReason: "혼자 살지 않음" },
      context({}),
    );
    expect(previews.at(-1)).toEqual({
      label: "해당 없음",
      answers: {},
      status: "NOT_APPLICABLE",
      reason: "혼자 살지 않음",
    });
  });

  it("금액 규칙은 입력한 가구원 수 기준으로 경계값을 보여준다", () => {
    const previews = previewOutcomes(incomeRule, context({ size: "2" }));
    expect(previews.map(({ label, status }) => [label, status])).toEqual([
      ["2인 가구, 월 251만 9,575원 (기준과 같음)", "MET"],
      ["2인 가구, 월 251만 9,576원 (기준보다 1원 많음)", "NOT_MET"],
      ["모르겠어요", "UNKNOWN"],
      ["미입력", "UNKNOWN"],
    ]);
  });

  it("가구원 수가 없으면 1인 가구 기준으로 보여준다", () => {
    expect(previewOutcomes(incomeRule, context({}))[0].label).toBe(
      "1인 가구, 월 153만 8,543원 (기준과 같음)",
    );
  });

  it("연령 규칙은 경계 나이별로 판정한다", () => {
    const previews = previewOutcomes(ageRule, context({}));
    expect(previews.map(({ label, status }) => [label, status])).toEqual([
      ["만 14세", "NOT_MET"],
      ["만 15세", "MET"],
      ["만 34세", "MET"],
      ["만 35세", "UNKNOWN"],
      ["만 38세", "NOT_MET"],
      ["미입력", "UNKNOWN"],
    ]);
  });

  it("기존 답을 바꾸지 않는다", () => {
    const answers = { house: "no" };
    previewOutcomes(houseRule, context(answers));
    expect(answers).toEqual({ house: "no" });
  });
});

describe("병역 기간 연령 가산", () => {
  const at = (age: number, military?: string) =>
    evaluateRule(
      ageRule,
      context({ birth: birthDateForAge(age, NOW), ...(military === undefined ? {} : { military }) }),
    ).status;

  it.each([
    [35, "0", "NOT_MET"],
    [35, "12", "MET"],
    [36, "12", "NOT_MET"],
    [37, "36", "MET"],
    [37, "120", "MET"],
    [38, "120", "NOT_MET"],
  ])("만 %i세, 병역 %s개월은 %s이다", (age, military, status) => {
    expect(at(age, military)).toBe(status);
  });

  it("병역 기간을 모르면 확인 필요다", () => {
    expect(at(35, UNKNOWN_ANSWER)).toBe("UNKNOWN");
    expect(at(35)).toBe("UNKNOWN");
  });
});

describe("접수 기간", () => {
  const window = {
    kind: "period",
    start: "2026-03-30T09:00:00+09:00",
    end: "2026-05-29T16:00:00+09:00",
    closedTitle: "2026년 접수 마감",
  } as const;

  it.each([
    ["2026-03-30T08:59:59+09:00", "upcoming"],
    ["2026-03-30T09:00:00+09:00", "open"],
    ["2026-05-29T16:00:00+09:00", "open"],
    ["2026-05-29T16:00:01+09:00", "closed"],
  ])("%s는 %s이다", (time, status) => {
    expect(applicationState(window, new Date(time)).status).toBe(status);
  });

  it("마감 후에는 마감 제목과 기간을 보여준다", () => {
    expect(applicationState(window, NOW)).toEqual({
      status: "closed",
      title: "2026년 접수 마감",
      label: "2026.03.30 09:00 ~ 2026.05.29 16:00 (마감)",
    });
  });

  it("상시 신청은 항상 열려 있다", () => {
    expect(applicationState({ kind: "always" }, NOW).status).toBe("open");
  });
});

describe("순수성", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const sources = readdirSync(dir).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );

  it.each(sources)("%s는 같은 폴더의 파일만 import한다", (file) => {
    const code = readFileSync(join(dir, file), "utf8");
    const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    expect(specifiers.filter((specifier) => !specifier.startsWith("./"))).toEqual([]);
    expect(code).not.toMatch(/\bfetch\s*\(|process\.env|XMLHttpRequest|localStorage/);
  });
});
