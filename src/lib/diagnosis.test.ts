import { describe, expect, it } from "vitest";
import type { Policy } from "../data/policies";
import {
  diagnose,
  formatManwon,
  manwonToWon,
  type DiagnosisInput,
  type Profile,
} from "./diagnosis";

const seoulPolicy: Policy = {
  id: "seoul",
  name: "테스트 서울 정책",
  field: "주거",
  minAge: 19,
  maxAge: 34,
  regions: ["서울"],
  regionLabel: "서울",
  maxMonthlyIncome: 250,
  applyMethod: "온라인 신청",
  apply: { name: "테스트", url: "https://example.org" },
  documents: [
    { id: "doc-a", label: "서류 A", guide: "" },
    { id: "doc-b", label: "서류 B", guide: "" },
    { id: "doc-c", label: "서류 C", guide: "" },
  ],
};

const nationwidePolicy: Policy = {
  ...seoulPolicy,
  id: "nationwide",
  regions: null,
  regionLabel: "전국",
};

const ALL_DOCUMENTS = ["doc-a", "doc-b", "doc-c"];

const eligibleProfile: Profile = {
  age: "25",
  region: "서울",
  monthlyIncome: "250",
  status: "미취업",
};

function run(profile: Partial<Profile> = {}, options: Partial<DiagnosisInput> = {}) {
  return diagnose({
    policy: seoulPolicy,
    blocker: "documents",
    profile: { ...eligibleProfile, ...profile },
    checkedDocumentIds: [],
    inquiryResolved: false,
    ...options,
  });
}

function condition(id: "age" | "region" | "income", profile: Partial<Profile>, policy = seoulPolicy) {
  const result = run(profile, { policy }).conditions.find((item) => item.id === id);
  if (!result) throw new Error(`조건을 찾을 수 없습니다: ${id}`);
  return result;
}

describe("연령 조건", () => {
  it.each([
    ["18", "NOT_MET"],
    ["19", "MET"],
    ["34", "MET"],
    ["35", "NOT_MET"],
  ])("만 %s세는 %s이다", (age, status) => {
    expect(condition("age", { age }).status).toBe(status);
  });

  it.each(["", "   ", "25.5", "-1", "abc"])("유효하지 않은 입력 '%s'는 UNKNOWN이다", (age) => {
    expect(condition("age", { age }).status).toBe("UNKNOWN");
  });
});

describe("소득 조건", () => {
  it("상한과 같은 소득은 충족한다", () => {
    expect(condition("income", { monthlyIncome: "250" }).status).toBe("MET");
  });

  it("상한을 넘는 소득은 미충족이고 초과액을 표시한다", () => {
    const result = condition("income", { monthlyIncome: "280" });
    expect(result.status).toBe("NOT_MET");
    expect(result.detail).toBe("기준보다 30만 원 많은 것으로 보여요");
  });

  it.each([
    ["250.1", "0.1"],
    ["250.3", "0.3"],
    ["250.01", "0.01"],
    ["280.5", "30.5"],
  ])("소수 입력 %s의 초과액은 오차 없이 %s만 원이다", (monthlyIncome, gap) => {
    const result = condition("income", { monthlyIncome });
    expect(result.status).toBe("NOT_MET");
    expect(result.detail).toBe(`기준보다 ${gap}만 원 많은 것으로 보여요`);
  });

  it("상한 이내의 소수 입력은 입력값 그대로 표시한다", () => {
    const result = condition("income", { monthlyIncome: "249.9" });
    expect(result.status).toBe("MET");
    expect(result.detail).toBe("월 249.9만 원은 기준 이내로 보여요");
  });

  it.each(["", "-1", "abc", "1e400"])("유효하지 않은 입력 '%s'는 UNKNOWN이다", (monthlyIncome) => {
    expect(condition("income", { monthlyIncome }).status).toBe("UNKNOWN");
  });
});

describe("금액 변환", () => {
  it("만 원 단위 입력을 원 단위 정수로 바꾼다", () => {
    expect(manwonToWon("250.1")).toBe(2501000);
    expect(manwonToWon("0.07")).toBe(700);
    expect(manwonToWon("")).toBeNull();
  });

  it("원 단위 정수를 만 원 단위 문자열로 바꾼다", () => {
    expect(formatManwon(2500000)).toBe("250");
    expect(formatManwon(2501000)).toBe("250.1");
    expect(formatManwon(500)).toBe("0.05");
    expect(formatManwon(1)).toBe("0.0001");
  });
});

describe("지역 조건", () => {
  it("대상 지역은 충족한다", () => {
    expect(condition("region", { region: "서울" }).status).toBe("MET");
  });

  it("대상이 아닌 지역은 미충족이다", () => {
    expect(condition("region", { region: "부산" }).status).toBe("NOT_MET");
  });

  it("전국 정책은 모든 지역을 충족한다", () => {
    expect(condition("region", { region: "부산" }, nationwidePolicy).status).toBe("MET");
  });

  it("지역을 선택하지 않으면 전국 정책도 UNKNOWN이다", () => {
    expect(condition("region", { region: "" }, nationwidePolicy).status).toBe("UNKNOWN");
  });
});

describe("빈 입력", () => {
  it("모든 조건이 UNKNOWN이고 진행률은 0%이다", () => {
    const result = run({ age: "", region: "", monthlyIncome: "" });
    expect(result.conditions.map((item) => item.status)).toEqual([
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
    ]);
    expect(result.percent).toBe(0);
    expect(result.route).toBe("NEEDS_INQUIRY");
  });
});

describe("최종 경로", () => {
  it("미충족 조건이 있으면 INELIGIBLE이다", () => {
    const result = run({ monthlyIncome: "280" }, { checkedDocumentIds: ALL_DOCUMENTS });
    expect(result.route).toBe("INELIGIBLE");
    expect(result.canApply).toBe(false);
  });

  it("미충족은 확인 필요보다 우선한다", () => {
    expect(run({ age: "35", region: "" }).route).toBe("INELIGIBLE");
  });

  it("확인 필요 조건이 있으면 NEEDS_INQUIRY이다", () => {
    const result = run({ region: "" }, { checkedDocumentIds: ALL_DOCUMENTS });
    expect(result.route).toBe("NEEDS_INQUIRY");
    expect(result.canApply).toBe(false);
  });

  it("공식 기관 확인이 남아 있으면 NEEDS_INQUIRY이다", () => {
    const result = run({}, { blocker: "unclear", checkedDocumentIds: ALL_DOCUMENTS });
    expect(result.route).toBe("NEEDS_INQUIRY");
    expect(result.canApply).toBe(false);
  });

  it("확인 필요는 서류 부족보다 우선한다", () => {
    expect(run({ age: "" }).route).toBe("NEEDS_INQUIRY");
  });

  it("조건을 충족하고 서류가 부족하면 ACTION_REQUIRED이다", () => {
    const result = run({}, { checkedDocumentIds: ["doc-a"] });
    expect(result.route).toBe("ACTION_REQUIRED");
    expect(result.missingDocuments.map((item) => item.id)).toEqual(["doc-b", "doc-c"]);
    expect(result.canApply).toBe(false);
  });

  it("모두 통과하면 READY이고 신청할 수 있다", () => {
    const result = run({}, { checkedDocumentIds: ALL_DOCUMENTS });
    expect(result.route).toBe("READY");
    expect(result.canApply).toBe(true);
  });

  it("공식 기관 확인을 마치면 READY이다", () => {
    const result = run(
      {},
      { blocker: "unclear", checkedDocumentIds: ALL_DOCUMENTS, inquiryResolved: true },
    );
    expect(result.route).toBe("READY");
    expect(result.canApply).toBe(true);
  });
});

describe("진행률", () => {
  it.each([
    [[], 50, 3],
    [["doc-a"], 66, 2],
    [["doc-a", "doc-b"], 83, 1],
    [ALL_DOCUMENTS, 100, 0],
  ])("체크한 서류 %j는 %i%%이고 남은 항목은 %i개이다", (checkedDocumentIds, percent, remaining) => {
    const result = run({}, { checkedDocumentIds });
    expect(result.percent).toBe(percent);
    expect(result.remaining).toBe(remaining);
  });

  it("미충족 조건은 완료로 세지 않아 100%가 되지 않는다", () => {
    const result = run({ monthlyIncome: "250.1" }, { checkedDocumentIds: ALL_DOCUMENTS });
    expect(result.percent).toBe(83);
    expect(result.items.find((item) => item.id === "income")?.state).toBe("blocked");
  });

  it("조건이 불명확하면 공식 기관 확인 항목이 추가된다", () => {
    const pending = run({}, { blocker: "unclear", checkedDocumentIds: ALL_DOCUMENTS });
    expect(pending.items).toHaveLength(7);
    expect(pending.percent).toBe(85);

    const resolved = run(
      {},
      { blocker: "unclear", checkedDocumentIds: ALL_DOCUMENTS, inquiryResolved: true },
    );
    expect(resolved.percent).toBe(100);
  });
});
