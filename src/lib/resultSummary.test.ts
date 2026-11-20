import { describe, expect, it } from "vitest";
import { YOUTH_RENT } from "@/data/policies/youthRent";
import type { RuleResult, RuleStatus } from "@/lib/rules";
import { diagnose } from "./diagnosis";
import { countConditions, displayStatus, orderConditions, splitConditions, splitVisible } from "./resultSummary";

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
