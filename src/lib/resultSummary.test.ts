import { describe, expect, it } from "vitest";
import { YOUTH_RENT } from "@/data/policies/youthRent";
import type { RuleResult, RuleStatus } from "@/lib/rules";
import { diagnose } from "./diagnosis";
import {
  compactProgressLabel,
  countConditions,
  displayStatus,
  eligibilityItems,
  orderConditions,
  progressDescription,
  progressSummary,
  splitConditions,
  splitVisible,
} from "./resultSummary";

const NOW = new Date("2026-11-19T12:00:00+09:00");

/** 가상 데이터 */
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

function rentDiagnosis(overrides: Record<string, string>) {
  return diagnose({
    policy: YOUTH_RENT,
    answers: { ...RENT_OK, ...overrides },
    checkedDocumentIds: [],
    now: NOW,
  });
}

function result(ruleId: string, status: RuleStatus, verified = true): RuleResult {
  return {
    ruleId,
    label: ruleId,
    status,
    reason: "",
    evidence: { criterion: "", inputs: [], references: [] },
    source: { name: "가상 출처", url: "https://example.com" },
    verified,
    criterion: "",
    plainText: "",
    howToCheck: [],
  };
}

describe("displayStatus", () => {
  it("확인된 기준의 미충족은 미충족으로 보여준다", () => {
    expect(displayStatus(result("a", "NOT_MET", true))).toBe("NOT_MET");
  });

  it("확인 중인 기준의 미충족은 확인 필요로 보여준다", () => {
    expect(displayStatus(result("a", "NOT_MET", false))).toBe("UNKNOWN");
  });

  it("다른 상태는 그대로 둔다", () => {
    for (const status of ["MET", "UNKNOWN", "NOT_APPLICABLE"] as const) {
      expect(displayStatus(result("a", status, false))).toBe(status);
    }
  });

  it("진단 경로와 같은 기준을 쓴다: 확인 중인 기준만 걸리면 미충족 개수는 0이고 경로도 확인 필요다", () => {
    const diagnosis = rentDiagnosis({ movedIn: "no" });
    const raw = diagnosis.conditions.find((condition) => condition.ruleId === "rent-moved-in");
    expect(raw?.status).toBe("NOT_MET");
    expect(raw?.verified).toBe(false);
    expect(diagnosis.route).toBe("NEEDS_INQUIRY");
    expect(countConditions(diagnosis.conditions).notMet).toBe(0);
    expect(displayStatus(raw!)).toBe("UNKNOWN");
  });

  it("확인된 기준에 걸리면 미충족 개수에 들어가고 경로는 미충족이다", () => {
    const diagnosis = rentDiagnosis({ ownsHouse: "yes" });
    expect(diagnosis.route).toBe("INELIGIBLE");
    expect(countConditions(diagnosis.conditions).notMet).toBeGreaterThan(0);
  });
});

describe("countConditions", () => {
  it("해당 없음은 빼고 센다", () => {
    const counts = countConditions([
      result("a", "MET"),
      result("b", "MET"),
      result("c", "NOT_MET"),
      result("d", "NOT_MET", false),
      result("e", "UNKNOWN"),
      result("f", "NOT_APPLICABLE"),
    ]);
    expect(counts).toEqual({ met: 2, notMet: 1, unknown: 2 });
  });
});

describe("orderConditions", () => {
  it("미충족 → 확인 필요 → 충족 → 해당 없음 순서이고, 같은 상태는 원래 순서를 지킨다", () => {
    const ordered = orderConditions([
      result("na", "NOT_APPLICABLE"),
      result("met1", "MET"),
      result("unknown1", "UNKNOWN"),
      result("notmet-unverified", "NOT_MET", false),
      result("notmet1", "NOT_MET"),
      result("met2", "MET"),
      result("notmet2", "NOT_MET"),
    ]);
    expect(ordered.map((condition) => condition.ruleId)).toEqual([
      "notmet1",
      "notmet2",
      "unknown1",
      "notmet-unverified",
      "met1",
      "met2",
      "na",
    ]);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const input = [result("a", "MET"), result("b", "NOT_MET")];
    orderConditions(input);
    expect(input.map((condition) => condition.ruleId)).toEqual(["a", "b"]);
  });
});

describe("splitConditions", () => {
  it("미충족·확인 필요는 먼저 보일 목록에, 충족·해당 없음은 접을 목록에 넣고 순서를 지킨다", () => {
    const { attention, settled } = splitConditions([
      result("na", "NOT_APPLICABLE"),
      result("met1", "MET"),
      result("unknown1", "UNKNOWN"),
      result("notmet-unverified", "NOT_MET", false),
      result("notmet1", "NOT_MET"),
    ]);
    expect(attention.map((condition) => condition.ruleId)).toEqual([
      "notmet1",
      "unknown1",
      "notmet-unverified",
    ]);
    expect(settled.map((condition) => condition.ruleId)).toEqual(["met1", "na"]);
  });

  it("모든 조건을 빠짐없이 한 번씩 나눈다", () => {
    const input = [result("a", "MET"), result("b", "NOT_MET"), result("c", "NOT_APPLICABLE")];
    const { attention, settled } = splitConditions(input);
    expect(attention.length + settled.length).toBe(input.length);
  });
});

describe("splitVisible", () => {
  it("3개 이하면 모두 보여준다", () => {
    expect(splitVisible([1, 2, 3])).toEqual({ visible: [1, 2, 3], hidden: [] });
  });

  it("4개 이상이면 처음 3개만 보이고 나머지를 접는다", () => {
    expect(splitVisible([1, 2, 3, 4])).toEqual({ visible: [1, 2, 3], hidden: [4] });
    expect(splitVisible([1, 2, 3, 4, 5]).hidden).toHaveLength(2);
  });
});

describe("progressSummary (자격 확인 / 신청 준비 분리)", () => {
  const allDocuments = YOUTH_RENT.documents.map((document) => document.id);

  function withDocuments(overrides: Record<string, string>, checkedDocumentIds: string[]) {
    return diagnose({
      policy: YOUTH_RENT,
      answers: { ...RENT_OK, ...overrides },
      checkedDocumentIds,
      now: NOW,
    });
  }

  it("자격 개수는 결과 요약 카드의 countConditions와 같다", () => {
    const cases: Record<string, string>[] = [
      {},
      { ownsHouse: "yes" },
      { movedIn: "no" },
      { youthIncome: "" },
    ];
    for (const overrides of cases) {
      const diagnosis = withDocuments(overrides, []);
      const { eligibility } = progressSummary(diagnosis);
      const counts = countConditions(diagnosis.conditions);
      expect(eligibility).toMatchObject(counts);
      expect(eligibility.total).toBe(counts.met + counts.notMet + counts.unknown);
      expect(eligibilityItems(diagnosis.conditions)).toHaveLength(eligibility.total);
    }
  });

  it("미충족이 있으면 서류를 모두 체크해 합친 진행률이 높아도 자격은 개수로만 보이고 퍼센트가 없다", () => {
    const diagnosis = withDocuments({ ownsHouse: "yes" }, allDocuments);
    // 판정용 합산 진행률은 그대로 높다(판정 로직은 바꾸지 않는다).
    expect(diagnosis.route).toBe("INELIGIBLE");
    expect(diagnosis.percent).toBeGreaterThanOrEqual(80);

    const summary = progressSummary(diagnosis);
    expect(summary.eligibility.notMet).toBeGreaterThanOrEqual(1);
    expect(summary.eligibility).not.toHaveProperty("percent");
    expect(summary.documents.percent).toBe(100);

    const label = compactProgressLabel(summary);
    expect(label).not.toContain("%");
    expect(label).toBe(
      `자격 ${summary.eligibility.met}/${summary.eligibility.total} · 서류 ${allDocuments.length}/${allDocuments.length}`,
    );
    expect(progressDescription(summary)).not.toContain("%");
    expect(progressDescription(summary)).toContain(`미충족 가능성 ${summary.eligibility.notMet}개`);
  });

  it("확인 필요가 있어도 퍼센트 없이 확인 필요 개수로 보인다", () => {
    const diagnosis = withDocuments({ youthIncome: "" }, allDocuments);
    expect(diagnosis.route).toBe("NEEDS_INQUIRY");
    const summary = progressSummary(diagnosis);
    expect(summary.eligibility.unknown).toBeGreaterThanOrEqual(1);
    expect(summary.eligibility.met).toBeLessThan(summary.eligibility.total);
    expect(compactProgressLabel(summary)).not.toContain("%");
  });

  it("확인 중인 기준의 미충족은 확인 필요로 센다", () => {
    const diagnosis = withDocuments({ movedIn: "no" }, []);
    const summary = progressSummary(diagnosis);
    expect(summary.eligibility.notMet).toBe(0);
    expect(summary.eligibility.unknown).toBeGreaterThanOrEqual(1);
    const item = eligibilityItems(diagnosis.conditions).find((entry) => entry.id === "rent-moved-in");
    expect(item?.status).toBe("UNKNOWN");
  });

  it("해당 없음은 자격 목록과 개수에서 뺀다", () => {
    const items = eligibilityItems([
      result("a", "MET"),
      result("b", "NOT_APPLICABLE"),
      result("c", "NOT_MET", false),
    ]);
    expect(items.map((item) => [item.id, item.status])).toEqual([
      ["a", "MET"],
      ["c", "UNKNOWN"],
    ]);
  });

  it("한 줄 요약 형식: 자격 충족/전체 · 서류 완료/전체", () => {
    expect(
      compactProgressLabel({
        eligibility: { met: 8, notMet: 0, unknown: 1, total: 9 },
        documents: { done: 0, total: 3, percent: 0 },
      }),
    ).toBe("자격 8/9 · 서류 0/3");
  });

  it("서류 퍼센트는 서류만으로 계산한다", () => {
    const diagnosis = withDocuments({}, allDocuments.slice(0, 1));
    const { documents } = progressSummary(diagnosis);
    expect(documents.done).toBe(1);
    expect(documents.total).toBe(diagnosis.documents.length);
    expect(documents.percent).toBe(Math.floor((1 / documents.total) * 100));
  });
});
