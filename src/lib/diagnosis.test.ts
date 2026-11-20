import { describe, expect, it } from "vitest";
import { POLICIES, type Policy } from "@/data/policies";
import { NATIONAL_EMPLOYMENT } from "@/data/policies/nationalEmployment";
import { YOUTH_RENT } from "@/data/policies/youthRent";
import { birthDateForAge, UNKNOWN_ANSWER, type RuleStatus } from "@/lib/rules";
import { diagnose, questionPages, type DiagnosisInput } from "./diagnosis";
import { nextActions } from "./nextActions";
import { buildInquiryDraft } from "./drafts";

/** 청년월세 2026년 접수(3.30~5.29)가 끝난 뒤 */
const NOW = new Date("2026-11-19T12:00:00+09:00");
const DURING_RENT_APPLICATION = new Date("2026-04-15T12:00:00+09:00");

const RENT_OK: Record<string, string> = {
  birthDate: "2001-05-10",
  maritalStatus: "single",
  singleParent: "no",
  ownsHouse: "no",
  livesApart: "yes",
  movedIn: "yes",
  publicRental: "no",
  relativeLandlord: "no",
  otherRentSupport: "no",
  used24: "no",
  youthHouseholdSize: "1",
  youthIncome: "150",
  youthAsset: "3000",
  parentHouseholdSize: "3",
  parentIncome: "400",
  parentAsset: "30000",
};

const NES_OK: Record<string, string> = {
  birthDate: "2000-01-01",
  householdSize: "3",
  householdIncome: "200",
  householdAsset: "20000",
  ownIncome: "0",
  workType: "none",
  workExperience: "yes",
  livelihoodBenefit: "no",
  unemploymentBenefit: "no",
  publicJob: "no",
  schooling: "no",
};

const allDocuments = (policy: Policy) => policy.documents.map((document) => document.id);

function run(
  policy: Policy,
  answers: Record<string, string>,
  options: Partial<DiagnosisInput> = {},
) {
  return diagnose({
    policy,
    answers,
    checkedDocumentIds: [],
    now: NOW,
    ...options,
  });
}

function rent(changes: Record<string, string> = {}, options: Partial<DiagnosisInput> = {}) {
  return run(YOUTH_RENT, { ...RENT_OK, ...changes }, options);
}

function nes(changes: Record<string, string> = {}, options: Partial<DiagnosisInput> = {}) {
  return run(NATIONAL_EMPLOYMENT, { ...NES_OK, ...changes }, options);
}

function statusOf(result: ReturnType<typeof diagnose>, ruleId: string): RuleStatus {
  const condition = result.conditions.find((item) => item.ruleId === ruleId);
  if (!condition) throw new Error(`규칙을 찾을 수 없습니다: ${ruleId}`);
  return condition.status;
}

describe("정책 데이터 검수", () => {
  it.each(POLICIES.map((policy) => [policy.name, policy] as const))(
    "%s: 규칙마다 쉬운 뜻, 확인 방법, 출처 링크가 있다",
    (_, policy) => {
      for (const rule of policy.rules) {
        expect(rule.plainText.trim(), rule.id).not.toBe("");
        expect(rule.howToCheck.length, rule.id).toBeGreaterThan(0);
        expect(rule.source.url, rule.id).toMatch(/^https:\/\//);
      }
    },
  );

  it.each(POLICIES.map((policy) => [policy.name, policy] as const))(
    "%s: 질문 묶음은 4개 이하이고 모든 질문이 한 번씩 들어 있다",
    (_, policy) => {
      const grouped = policy.questionGroups.flatMap((group) => group.questionIds);
      for (const group of policy.questionGroups) {
        expect(group.questionIds.length, group.id).toBeLessThanOrEqual(4);
      }
      expect([...grouped].sort()).toEqual(policy.questions.map((question) => question.id).sort());
    },
  );

  it("공고 원문으로 확인하지 못한 기준은 verified: false다", () => {
    const unverified = (policy: Policy) =>
      policy.rules.filter((rule) => !rule.verified).map((rule) => rule.id);
    expect(unverified(YOUTH_RENT)).toEqual(
      expect.arrayContaining(["rent-youth-asset", "rent-parent-asset"]),
    );
    expect(unverified(NATIONAL_EMPLOYMENT)).toEqual(["nes-own-income"]);
  });
});

describe("청년월세 경계값", () => {
  it.each([
    ["1990-12-31", "NOT_MET"],
    ["1991-01-01", "MET"],
    ["2007-12-31", "MET"],
    ["2008-01-01", "NOT_MET"],
  ])("생년월일 %s는 %s이다", (birthDate, status) => {
    expect(statusOf(rent({ birthDate }), "rent-age")).toBe(status);
  });

  it.each([
    ["1", "153.8543", "MET"],
    ["1", "153.8544", "NOT_MET"],
    ["2", "251.9575", "MET"],
    ["2", "251.9576", "NOT_MET"],
  ])("청년가구 %s인, 월 %s만 원은 %s이다 (중위소득 60%%)", (size, income, status) => {
    expect(
      statusOf(rent({ youthHouseholdSize: size, youthIncome: income }), "rent-youth-income"),
    ).toBe(status);
  });

  it.each([
    ["535.9036", "MET"],
    ["535.9037", "NOT_MET"],
  ])("원가구 3인, 월 %s만 원은 %s이다 (중위소득 100%%)", (parentIncome, status) => {
    expect(statusOf(rent({ parentIncome }), "rent-parent-income")).toBe(status);
  });

  it.each([
    ["12200", "MET"],
    ["12200.0001", "NOT_MET"],
  ])("청년가구 재산 %s만 원은 %s이다", (youthAsset, status) => {
    expect(statusOf(rent({ youthAsset }), "rent-youth-asset")).toBe(status);
  });

  it("8인 이상 가구는 기준표에 없어 확인 필요다", () => {
    expect(statusOf(rent({ youthHouseholdSize: "8" }), "rent-youth-income")).toBe("UNKNOWN");
  });

  it("확인된 기준을 넘으면 INELIGIBLE이다", () => {
    expect(rent({ youthIncome: "153.8544" }).route).toBe("INELIGIBLE");
  });

  it("확인 중인 기준을 넘으면 확정하지 않고 NEEDS_INQUIRY다", () => {
    const result = rent({ youthAsset: "12200.0001" }, { checkedDocumentIds: allDocuments(YOUTH_RENT) });
    expect(statusOf(result, "rent-youth-asset")).toBe("NOT_MET");
    expect(result.route).toBe("NEEDS_INQUIRY");
    expect(result.canApply).toBe(false);
  });
});

describe("생년월일 입력과 연령 조건", () => {
  const ageCondition = (policy: Policy, birthDate: string, ruleId: string) => {
    const base = policy === YOUTH_RENT ? RENT_OK : NES_OK;
    return run(policy, { ...base, birthDate }).conditions.find((item) => item.ruleId === ruleId);
  };

  it.each([
    ["", "아직 입력하지 않았어요"],
    ["1999-02-31", "올바른 생년월일을 입력해 주세요"],
    ["2026-11-20", "올바른 생년월일을 입력해 주세요"],
    ["1999-03", "올바른 생년월일을 입력해 주세요"],
  ])("'%s'는 두 정책 모두 확인 필요다", (birthDate, reason) => {
    for (const [policy, ruleId] of [
      [YOUTH_RENT, "rent-age"],
      [NATIONAL_EMPLOYMENT, "nes-age"],
    ] as const) {
      const condition = ageCondition(policy, birthDate, ruleId);
      expect(condition?.status).toBe("UNKNOWN");
      expect(condition?.reason).toContain(reason);
    }
  });

  it("국취는 만 35세 생일 전날까지 기준 안이고, 생일 당일부터는 병역 기간이 있어야 판단한다", () => {
    expect(ageCondition(NATIONAL_EMPLOYMENT, "1991-11-20", "nes-age")?.status).toBe("MET");
    expect(ageCondition(NATIONAL_EMPLOYMENT, "1991-11-19", "nes-age")?.status).toBe("UNKNOWN");
  });

  it("국취는 만 15세 생일 당일부터 기준 안이다", () => {
    expect(ageCondition(NATIONAL_EMPLOYMENT, "2011-11-20", "nes-age")?.status).toBe("NOT_MET");
    expect(ageCondition(NATIONAL_EMPLOYMENT, "2011-11-19", "nes-age")?.status).toBe("MET");
  });

  it("청년월세는 생일과 관계없이 출생연도로 본다", () => {
    expect(ageCondition(YOUTH_RENT, "1991-12-31", "rent-age")?.status).toBe("MET");
    expect(ageCondition(YOUTH_RENT, "1990-12-31", "rent-age")?.status).toBe("NOT_MET");
  });
});

describe("청년월세 원가구 심사 면제", () => {
  const parentRules = ["rent-parent-income", "rent-parent-asset"];
  const parentStatuses = (changes: Record<string, string>) =>
    parentRules.map((ruleId) => statusOf(rent(changes), ruleId));

  it("만 29세 미혼은 부모님 소득·재산을 본다", () => {
    expect(parentStatuses({ birthDate: "1996-11-20" })).toEqual(["MET", "MET"]);
  });

  it("만 30세가 되는 날부터는 보지 않는다", () => {
    expect(parentStatuses({ birthDate: "1996-11-19" })).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE"]);
  });

  it("기혼이거나 미혼부·모이면 보지 않는다", () => {
    expect(parentStatuses({ maritalStatus: "married" })).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE"]);
    expect(parentStatuses({ singleParent: "yes" })).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE"]);
  });

  it("생년월일을 모르면 보수적으로 부모님 소득·재산을 본다", () => {
    expect(parentStatuses({ birthDate: "" })).toEqual(["MET", "MET"]);
  });

  it("면제되면 부모님 질문 화면이 사라지고 진행률 분모에서도 빠진다", () => {
    const exempt = { ...RENT_OK, maritalStatus: "married" };
    expect(questionPages(YOUTH_RENT, exempt, NOW).map((page) => page.group.id)).not.toContain(
      "parent-money",
    );
    expect(questionPages(YOUTH_RENT, RENT_OK, NOW).map((page) => page.group.id)).toContain(
      "parent-money",
    );

    const checked = { checkedDocumentIds: allDocuments(YOUTH_RENT) };
    expect(rent({}, checked).items).toHaveLength(12 + 5);
    expect(rent({ maritalStatus: "married" }, checked).items).toHaveLength(10 + 5);
    expect(rent({ maritalStatus: "married" }, checked).percent).toBe(100);
  });

  it("기혼이면 미혼부·모 질문을 숨긴다", () => {
    const basic = questionPages(YOUTH_RENT, { maritalStatus: "married" }, NOW)[0];
    expect(basic.questions.map((question) => question.id)).toEqual(["birthDate", "maritalStatus"]);
  });
});

describe("모르겠어요", () => {
  it("선택형 질문은 확인 필요가 되고 완료로 세지 않는다", () => {
    const result = rent({ ownsHouse: UNKNOWN_ANSWER }, { checkedDocumentIds: allDocuments(YOUTH_RENT) });
    const condition = result.conditions.find((item) => item.ruleId === "rent-no-house");
    expect(condition?.status).toBe("UNKNOWN");
    expect(condition?.reason).toContain("모르겠어요");
    expect(result.items.find((item) => item.id === "rent-no-house")?.state).toBe("todo");
    expect(result.route).toBe("NEEDS_INQUIRY");
    expect(result.percent).toBeLessThan(100);
  });

  it("금액 질문도 확인 필요가 되고 근거에 모르겠어요가 남는다", () => {
    const condition = nes({ householdIncome: UNKNOWN_ANSWER }).conditions.find(
      (item) => item.ruleId === "nes-household-income",
    );
    expect(condition?.status).toBe("UNKNOWN");
    expect(condition?.evidence.inputs.find((input) => input.questionId === "householdIncome")?.value).toBe(
      "모르겠어요",
    );
  });

  it("모르겠어요는 미충족보다 우선하지 않는다", () => {
    expect(nes({ householdIncome: UNKNOWN_ANSWER, livelihoodBenefit: "yes" }).route).toBe("INELIGIBLE");
  });
});

describe("접수 마감", () => {
  const ready = { checkedDocumentIds: allDocuments(YOUTH_RENT) };

  it("마감 후에는 준비가 100%여도 신청 버튼이 열리지 않는다", () => {
    const result = rent({}, ready);
    expect(result.route).toBe("READY");
    expect(result.percent).toBe(100);
    expect(result.application).toMatchObject({ status: "closed", title: "2026년 접수 마감" });
    expect(result.canApply).toBe(false);
  });

  it("접수 기간 중에는 신청할 수 있다", () => {
    const result = rent({}, { ...ready, now: DURING_RENT_APPLICATION });
    expect(result.application.status).toBe("open");
    expect(result.canApply).toBe(true);
  });

  it("마감된 정책에는 다음 공고 대비 안내가 있다", () => {
    expect(YOUTH_RENT.closedGuide?.length).toBeGreaterThan(0);
  });

  it("상시 신청 정책은 마감되지 않는다", () => {
    const result = nes({}, { checkedDocumentIds: allDocuments(NATIONAL_EMPLOYMENT) });
    expect(result.application.status).toBe("open");
    expect(result.canApply).toBe(true);
  });
});

describe("국민취업지원제도 I유형 (청년)", () => {
  it.each([
    [14, undefined, "NOT_MET"],
    [15, undefined, "MET"],
    [34, undefined, "MET"],
    [35, undefined, "UNKNOWN"],
    [35, "0", "NOT_MET"],
    [35, "24", "MET"],
    [38, "36", "NOT_MET"],
  ])("만 %i세, 병역 %s개월은 %s이다", (age, militaryMonths, status) => {
    const changes: Record<string, string> = { birthDate: birthDateForAge(age, NOW) };
    if (militaryMonths !== undefined) changes.militaryMonths = militaryMonths;
    expect(statusOf(nes(changes), "nes-age")).toBe(status);
  });

  it("만 35세 이상일 때만 병역 기간을 묻는다", () => {
    const ids = (age: number) =>
      questionPages(NATIONAL_EMPLOYMENT, { birthDate: birthDateForAge(age, NOW) }, NOW)[0].questions.map(
        (question) => question.id,
      );
    expect(ids(34)).not.toContain("militaryMonths");
    expect(ids(35)).toContain("militaryMonths");
  });

  it.each([
    ["643.0843", "MET"],
    ["643.0844", "NOT_MET"],
  ])("3인 가구 월 %s만 원은 %s이다 (중위소득 120%%)", (householdIncome, status) => {
    expect(statusOf(nes({ householdIncome }), "nes-household-income")).toBe(status);
  });

  it("중위소득 60%를 넘으면 충족이어도 선발 주의를 덧붙인다", () => {
    const reason = (householdIncome: string) =>
      nes({ householdIncome }).conditions.find((item) => item.ruleId === "nes-household-income")?.reason;
    expect(reason("321.5422")).not.toContain("예산");
    expect(reason("321.5423")).toContain("예산 상황에 따라");
  });

  it.each([
    ["50000", "MET"],
    ["50000.0001", "NOT_MET"],
  ])("가구 재산 %s만 원은 %s이다", (householdAsset, status) => {
    expect(statusOf(nes({ householdAsset }), "nes-household-asset")).toBe(status);
  });

  it("본인 소득 제한은 확인 중인 기준이라 넘어도 NEEDS_INQUIRY다", () => {
    const result = nes({ ownIncome: "153.8544" });
    expect(statusOf(result, "nes-own-income")).toBe("NOT_MET");
    expect(result.route).toBe("NEEDS_INQUIRY");
  });

  it("일하지 않으면 근로 조건은 해당 없음이다", () => {
    const result = nes();
    expect(statusOf(result, "nes-weekly-hours")).toBe("NOT_APPLICABLE");
    expect(statusOf(result, "nes-business-income")).toBe("NOT_APPLICABLE");
  });

  it("주 30시간 이상 일하면 INELIGIBLE이고 II유형 안내가 있다", () => {
    const result = nes({ workType: "wage", weeklyHours: "over30" });
    expect(statusOf(result, "nes-weekly-hours")).toBe("NOT_MET");
    expect(result.route).toBe("INELIGIBLE");
    expect(NATIONAL_EMPLOYMENT.alternative?.title).toContain("II유형");
  });

  it("취업 경험이 부족하거나 모르면 선발형 안내를 띄운다", () => {
    expect(nes({ workExperience: "yes" }).advisories).toEqual([]);
    expect(nes({ workExperience: "no" }).advisories.map((item) => item.id)).toEqual(["selection-type"]);
    expect(nes({ workExperience: UNKNOWN_ANSWER }).advisories).toHaveLength(1);
    expect(nes({ workExperience: "" }).advisories).toEqual([]);
  });
});

describe("다음 행동 (판정 결과로 결정)", () => {
  const docs = (policy: Policy) => ({ checkedDocumentIds: allDocuments(policy) });

  it.each([
    ["확인된 기준 미충족", () => rent({ ownsHouse: "yes" }), "INELIGIBLE", ["inquiry", "proposal"]],
    ["모르겠어요", () => rent({ ownsHouse: UNKNOWN_ANSWER }), "NEEDS_INQUIRY", ["inquiry", "prepare"]],
    ["확인 중인 기준 미충족", () => rent({ youthAsset: "13000" }), "NEEDS_INQUIRY", ["inquiry", "prepare"]],
    ["서류 부족", () => nes({}, { checkedDocumentIds: ["guide-video"] }), "ACTION_REQUIRED", ["prepare", "inquiry"]],
    ["준비 완료", () => nes({}, docs(NATIONAL_EMPLOYMENT)), "READY", ["prepare", "inquiry"]],
  ] as const)("%s이면 경로 %s, 선택지 %j이고 첫 번째가 추천이다", (_, make, route, options) => {
    const result = make();
    expect(result.route).toBe(route);
    const plan = nextActions(result);
    expect(plan.options).toEqual(options);
    expect(plan.recommended).toBe(options[0]);
  });

  it("미충족이면 막힌 조건을 기준 재확인 문의 대상으로 넣고, 그 밖에는 넣지 않는다", () => {
    expect(nextActions(rent({ ownsHouse: "yes" })).inquiryFocusRuleIds).toEqual(["rent-no-house"]);
    expect(nextActions(rent({ ownsHouse: UNKNOWN_ANSWER })).inquiryFocusRuleIds).toEqual([]);
  });

  it("확인 중인 기준에만 걸리면 정책 개선 건의를 선택지에 두지 않는다", () => {
    expect(nextActions(rent({ youthAsset: "13000" })).options).not.toContain("proposal");
  });

  it("모르겠어요로 답한 조건이 있으면 문의를 추천하고 그 조건이 문의문에 들어간다", () => {
    const result = rent({ ownsHouse: UNKNOWN_ANSWER });
    expect(result.route).toBe("NEEDS_INQUIRY");
    expect(nextActions(result).recommended).toBe("inquiry");

    const draft = buildInquiryDraft(YOUTH_RENT, "", "", result.conditions);
    expect(draft).toContain("확인이 필요한 항목: 아래 조건을 제 상황에 적용하는 방법");
    expect(draft).toContain("- 무주택 (기준: 무주택 청년)");
  });

  it("확인 중인 기준에 맞지 않을 때도 문의를 추천하고 그 조건이 문의문에 들어간다", () => {
    const result = rent({ youthAsset: "13000" });
    expect(result.route).toBe("NEEDS_INQUIRY");
    expect(nextActions(result).recommended).toBe("inquiry");
    expect(buildInquiryDraft(YOUTH_RENT, "", "", result.conditions)).toContain("- 청년가구 재산");
  });

  it("설명 카드에서 문의하겠다고 고른 조건은 충족이어도 문의문에 들어간다", () => {
    const conditions = rent().conditions;
    expect(buildInquiryDraft(YOUTH_RENT, "", "", conditions)).not.toContain("- 연령");
    expect(buildInquiryDraft(YOUTH_RENT, "", "", conditions, ["rent-age"])).toContain(
      "- 연령 (기준: 1991~2007년생 (만 19~34세))",
    );
  });

  it("고른 주제가 있으면 그 주제를 쓰고, 확인할 조건이 없으면 기본 주제를 쓴다", () => {
    expect(buildInquiryDraft(YOUTH_RENT, "소득 산정방식", "", [])).toContain(
      "확인이 필요한 항목: 소득 산정방식",
    );
    expect(buildInquiryDraft(YOUTH_RENT, "", "", rent().conditions)).toContain(
      "확인이 필요한 항목: 그 밖의 자격조건",
    );
  });
});

describe("최종 경로와 진행률", () => {
  it("빈 입력은 모두 확인 필요이고 진행률은 0%다", () => {
    const result = run(NATIONAL_EMPLOYMENT, {});
    expect(result.percent).toBe(0);
    expect(result.route).toBe("NEEDS_INQUIRY");
  });

  it("조건을 충족하고 서류가 부족하면 ACTION_REQUIRED다", () => {
    const result = nes({}, { checkedDocumentIds: ["guide-video"] });
    expect(result.route).toBe("ACTION_REQUIRED");
    expect(result.missingDocuments.map((item) => item.id)).toEqual([
      "job-seeker-registration",
      "household-consent",
    ]);
  });

  it("사용자 선택 없이, 조건을 모두 충족하고 서류를 다 체크하면 READY이고 진행률 항목은 조건과 서류뿐이다", () => {
    const result = nes({}, { checkedDocumentIds: allDocuments(NATIONAL_EMPLOYMENT) });
    expect(result.route).toBe("READY");
    expect(result.items.map((item) => item.id)).not.toContain("inquiry");
  });

  it("해당 없는 조건은 진행률 항목에 넣지 않는다", () => {
    const result = nes({}, { checkedDocumentIds: allDocuments(NATIONAL_EMPLOYMENT) });
    expect(result.items.map((item) => item.id)).not.toContain("nes-weekly-hours");
    expect(result.percent).toBe(100);
  });
});
