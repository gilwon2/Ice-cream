import { APICallError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as explainRoute } from "@/app/api/explain/route";
import { YOUTH_RENT } from "@/data/policies/youthRent";
import { NATIONAL_EMPLOYMENT } from "@/data/policies/nationalEmployment";
import { evaluationContext } from "@/lib/diagnosis";
import { previewOutcomes, ruleInputQuestionIds, UNKNOWN_ANSWER } from "@/lib/rules";
import type { AiConfig } from "./config";
import type { AiGenerate, AiGenerateArgs } from "./client";
import {
  EXPLAIN_SYSTEM_PROMPT,
  NOT_IN_SOURCE_REPLY,
  aiPreviewReason,
  buildExplainGrounding,
  explainRule,
  validateExplanation,
} from "./explain";
import { buildExplainRequest, explainRequestSchema, type ExplainRequest } from "./explainShared";
import { ACCESS_CODE_HEADER, encodeAccessCode } from "./shared";

const NOW = new Date("2026-11-19T12:00:00+09:00");
const config: AiConfig = { apiKey: "test-key", model: "claude-sonnet-5-5", accessCode: "demo" };

const rule = (id: string) => {
  const found = [...YOUTH_RENT.rules, ...NATIONAL_EMPLOYMENT.rules].find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** 31세 미혼 → 원가구(부모) 소득은 보지 않는 경우 */
const parentIncomeRequest: ExplainRequest = buildExplainRequest(YOUTH_RENT, rule("rent-parent-income"), {
  birthDate: "1995-03-15",
  maritalStatus: "single",
  singleParent: "no",
  parentIncome: UNKNOWN_ANSWER,
  youthIncome: "150",
});

const noHouseRequest: ExplainRequest = buildExplainRequest(YOUTH_RENT, rule("rent-no-house"), {
  ownsHouse: UNKNOWN_ANSWER,
});

function mockGenerate(output: unknown, finishReason = "stop") {
  const calls: AiGenerateArgs[] = [];
  const generate: AiGenerate = async (args) => {
    calls.push(args);
    return { output, finishReason };
  };
  return { generate, calls };
}

describe("요청 범위", () => {
  it("규칙에 필요한 답만 보낸다 (다른 질문의 답은 빠진다)", () => {
    expect(parentIncomeRequest).toEqual({
      policyId: "youth-rent",
      ruleId: "rent-parent-income",
      answers: {
        birthDate: "1995-03-15",
        maritalStatus: "single",
        singleParent: "no",
        parentIncome: UNKNOWN_ANSWER,
      },
    });
    expect(ruleInputQuestionIds(rule("rent-parent-income"))).toEqual([
      "parentHouseholdSize",
      "parentIncome",
      "birthDate",
      "maritalStatus",
      "singleParent",
    ]);
  });

  it("규칙과 관계없는 값, 메모, 판정 값이 섞이면 400 대상이다", () => {
    expect(explainRequestSchema.safeParse(parentIncomeRequest).success).toBe(true);
    const bad = [
      { ...parentIncomeRequest, answers: { ...parentIncomeRequest.answers, youthIncome: "150" } },
      { ...parentIncomeRequest, note: "메모 원문" },
      { ...parentIncomeRequest, status: "MET" },
      { ...parentIncomeRequest, ruleId: "nes-age" },
    ];
    for (const value of bad) expect(explainRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe("근거 (프롬프트)", () => {
  it("규칙의 쉬운 뜻, 확인 방법, 입력 상태, 현재 판정, 답별 결과, 출처만 담는다", () => {
    const { text } = buildExplainGrounding(parentIncomeRequest, NOW);
    const target = rule("rent-parent-income");
    expect(text).toContain(target.plainText);
    for (const step of target.howToCheck) expect(text).toContain(step);
    // 입력값(만 31세, 1995년생) 대신 입력 상태와 판정 상태 고정 문장만 담는다.
    expect(text).toContain("- 생년월일: 입력함");
    expect(text).toContain("- 원가구 월소득 합계: 모르겠어요");
    expect(text).toContain("- 부모님을 포함한 원가구 가구원 수: 미입력");
    expect(text).toContain("[현재 판정] 해당 없음");
    expect(text).toContain(`기준: ${target.criterion}`);
    expect(text).toContain("- 해당 없음: 해당 없음 (만 30세 이상이거나");
    // 사용자 가구원 수 대신 기준표의 1~7인 가구를 모두 미리보기로 담는다.
    expect(text).toContain("- 1인 가구, 월 ");
    expect(text).toContain("- 7인 가구, 월 ");
    expect(text).toContain("복지로 공지 · 2026년 청년월세 지원 신청 안내 (2026.03.20)");
    expect(text).toContain("보건복지부 · 기준 중위소득");
  });

  it("AI용 미리보기 문장에서 예시 금액의 '입력한'을 '예:'로 바꾸고, 화면 문장은 그대로 둔다", () => {
    expect(aiPreviewReason("입력한 256만 4,238원은 기준 이내로 보여요.")).toBe("예: 256만 4,238원은 기준 이내로 보여요.");
    // 숫자가 아닌 곳의 '입력한'은 사용자 값이 아니므로 그대로 둔다.
    expect(aiPreviewReason("입력한 상황에는 해당하지 않는 조건이에요.")).toBe("입력한 상황에는 해당하지 않는 조건이에요.");

    const { text } = buildExplainGrounding(parentIncomeRequest, NOW);
    expect(text).toContain("(예: 256만 4,238원은 기준 이내로 보여요.)");
    expect(text).not.toMatch(/입력한 \d/);

    // 화면(③ 답에 따라 달라지는 결과)이 쓰는 rules 엔진 문장은 바뀌지 않는다.
    const target = rule("rent-parent-income");
    const screen = previewOutcomes(target, evaluationContext(YOUTH_RENT, { parentHouseholdSize: "1" }, NOW));
    expect(screen.map((preview) => preview.reason)).toContain("입력한 256만 4,238원은 기준 이내로 보여요.");
  });

  it("생년월일 원값과 다른 질문의 답은 담지 않는다", () => {
    const { text } = buildExplainGrounding(parentIncomeRequest, NOW);
    expect(text).not.toMatch(/1995-03-15|1995\.03\.15/);
    expect(text).not.toContain("청년가구 월소득");
  });

  it("확인 중인 기준이면 그 사실을 근거에 적는다", () => {
    const request = buildExplainRequest(YOUTH_RENT, rule("rent-youth-asset"), { youthAsset: UNKNOWN_ANSWER });
    expect(buildExplainGrounding(request, NOW).text).toContain("[주의]");
  });

  it("시스템 프롬프트에 금지 규칙이 들어 있다", () => {
    expect(EXPLAIN_SYSTEM_PROMPT).toContain("존댓말");
    expect(EXPLAIN_SYSTEM_PROMPT).toContain("최대 세 문장");
    expect(EXPLAIN_SYSTEM_PROMPT).toContain("만들지 않습니다");
    expect(EXPLAIN_SYSTEM_PROMPT).toContain("추측하지 않습니다");
    expect(EXPLAIN_SYSTEM_PROMPT).toContain("우회하는 방법");
    expect(EXPLAIN_SYSTEM_PROMPT).toContain(NOT_IN_SOURCE_REPLY);
    // 가구 규모별 금액을 표처럼 나열하지 않게 한다.
    expect(EXPLAIN_SYSTEM_PROMPT).toContain("한두 개 예시만");
    expect(EXPLAIN_SYSTEM_PROMPT).toContain("답에 따라 달라지는 결과");
  });
});

describe("explainRule: 정상", () => {
  it("검증을 통과한 맞춤 설명을 돌려주고, 근거를 담은 프롬프트로 한 번만 부른다", async () => {
    const { generate, calls } = mockGenerate({
      personalNote: "지금 답으로는 해당 없는 조건이라 부모님 소득은 보지 않아요. 원가구 월소득은 확인하지 않아도 돼요.",
    });
    const result = await explainRule(parentIncomeRequest, { config, generate, now: NOW });

    expect(result).toEqual({
      ok: true,
      personalNote: "지금 답으로는 해당 없는 조건이라 부모님 소득은 보지 않아요. 원가구 월소득은 확인하지 않아도 돼요.",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toBe(EXPLAIN_SYSTEM_PROMPT);
    expect(calls[0].prompt).toContain("[근거]");
    expect(calls[0].prompt).toContain("[현재 판정] 해당 없음");
    expect(calls[0].prompt).not.toMatch(/31세|1995년생/);
  });

  it("근거에 없다는 정해진 답도 통과한다", async () => {
    const { generate } = mockGenerate({ personalNote: `${NOT_IN_SOURCE_REPLY}.` });
    expect(await explainRule(noHouseRequest, { config, generate, now: NOW })).toMatchObject({ ok: true });
  });
});

describe("explainRule: 실패하면 기본 설명으로 대체", () => {
  it("키가 없으면 AI를 부르지 않고 missing_key다", async () => {
    const { generate, calls } = mockGenerate({ personalNote: "x" });
    const result = await explainRule(noHouseRequest, { config: { ...config, apiKey: null }, generate, now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "missing_key" });
    expect(calls).toHaveLength(0);
  });

  it("429, 시간 초과, 거절도 예외 없이 ok: false다", async () => {
    const rateLimited: AiGenerate = async () => {
      throw new APICallError({
        message: "rate limited",
        url: "https://api.anthropic.com/v1/messages",
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: true,
      });
    };
    const hanging: AiGenerate = () => new Promise(() => {});
    const refused = mockGenerate(undefined, "content-filter").generate;

    expect(await explainRule(noHouseRequest, { config, generate: rateLimited, now: NOW })).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
    expect(
      await explainRule(noHouseRequest, { config, generate: hanging, timeoutMs: 20, now: NOW }),
    ).toMatchObject({ ok: false, reason: "timeout" });
    expect(await explainRule(noHouseRequest, { config, generate: refused, now: NOW })).toMatchObject({
      ok: false,
      reason: "refused",
    });
  });
});

describe("explainRule: 출력 검증 실패", () => {
  it.each([
    ["판정 값을 담은 필드", { personalNote: "주택이 없으면 충족으로 보여요.", status: "MET" }],
    ["필드 이름이 다름", { note: "주택이 없으면 충족으로 보여요." }],
    ["빈 문장", { personalNote: "" }],
    ["판정 코드", { personalNote: "주택이 없으면 MET이에요." }],
    ["근거에 없는 금액", { personalNote: "주택 가격이 3억 원 이하면 괜찮아요." }],
    ["추측", { personalNote: "아마 충족하실 거예요." }],
    ["우회 제안", { personalNote: "명의를 잠시 숨기는 방법도 있어요." }],
    ["세 문장 초과", { personalNote: "첫째예요. 둘째예요. 셋째예요. 넷째예요." }],
    ["링크", { personalNote: "https://example.org 를 보세요." }],
  ])("%s이면 invalid_output으로 버린다", async (_, output) => {
    const { generate } = mockGenerate(output);
    expect(await explainRule(noHouseRequest, { config, generate, now: NOW })).toMatchObject({
      ok: false,
      reason: "invalid_output",
    });
  });

  it("근거에 있는 숫자는 쓸 수 있다", () => {
    const { text } = buildExplainGrounding(parentIncomeRequest, NOW);
    expect(validateExplanation("만 30세 이상이면 부모님 소득은 보지 않아요.", text)).toBe(true);
    expect(validateExplanation("만 32세 이상이면 부모님 소득은 보지 않아요.", text)).toBe(false);
  });

  it("사용자 나이는 근거에 없으므로 AI가 나이를 쓰면 버린다", () => {
    const { text } = buildExplainGrounding(parentIncomeRequest, NOW);
    expect(validateExplanation("만 31세라서 부모님 소득은 보지 않아요.", text)).toBe(false);
  });
});

describe("POST /api/explain (guard 연결)", () => {
  afterEach(() => vi.unstubAllEnvs());

  const post = (ip: string, body: unknown, code: string | null = "demo") =>
    explainRoute(
      new Request("http://localhost/api/explain", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          ...(code ? { [ACCESS_CODE_HEADER]: encodeAccessCode(code) } : {}),
        },
        body: JSON.stringify(body),
      }),
    );

  it("접근 코드가 없으면 401이다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "demo");
    expect((await post("192.0.2.30", noHouseRequest, null)).status).toBe(401);
  });

  it("메모가 섞인 본문은 400이다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "demo");
    expect((await post("192.0.2.31", { ...noHouseRequest, note: "메모" })).status).toBe(400);
  });

  it("키가 없으면 200과 ok: false를 돌려줘 화면이 기본 설명을 보여주게 한다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "demo");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await post("192.0.2.32", noHouseRequest);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, reason: "missing_key" });
  });
});
