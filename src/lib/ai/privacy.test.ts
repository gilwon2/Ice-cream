import { describe, expect, it } from "vitest";
import { NATIONAL_EMPLOYMENT } from "@/data/policies/nationalEmployment";
import type { AiGenerate, AiGenerateArgs } from "./client";
import type { AiConfig } from "./config";
import { aiConditionRequestSchema, buildAiContext } from "./context";
import { explainRule } from "./explain";
import { buildExplainRequest, explainCacheKey } from "./explainShared";

/**
 * 대회 규정: 사용자 입력에서 나온 값(출생연도, 만 나이, 금액, 병역 개월 수)은 AI로 보내지 않는다.
 * AI 컨텍스트와 실제 프롬프트 문자열을 만들어 입력한 숫자가 하나도 없는지 확인한다.
 */

const NOW = new Date("2026-11-19T12:00:00+09:00");
const config: AiConfig = {
  apiKey: "test-key",
  model: "claude-sonnet-5-5",
  accessCode: "demo",
  rateLimitPerMinute: 30,
};

/**
 * 가상 데이터. 1990-06-17생 = 만 36세(병역 18개월을 더하면 연령 기준 안),
 * 3인 가구, 가구 소득 4,321만 원, 가구 재산 1억 2,345만 원, 본인 소득 187만 원.
 */
const ANSWERS = {
  birthDate: "1990-06-17",
  militaryMonths: "18",
  householdSize: "3",
  householdIncome: "4321",
  householdAsset: "12345",
  ownIncome: "187",
};

/** 입력에서 나온 숫자: 생년월일 각 부분, 출생연도, 만 나이, 개월 수, 금액(만 원·원 단위) */
const FORBIDDEN_NUMBERS = ["1990", "0617", "36", "18", "4321", "43210000", "12345", "123450000", "187", "1870000"];

/** 같은 판정 상태가 나오는 다른 값. 프롬프트가 입력값에 따라 달라지지 않는지 비교한다. */
const OTHER_ANSWERS = {
  birthDate: "1990-03-02",
  militaryMonths: "24",
  householdSize: "4",
  householdIncome: "9999",
  householdAsset: "23456",
  ownIncome: "199",
};

const AI_RULE_IDS = ["nes-age", "nes-household-income", "nes-household-asset", "nes-own-income"];

/** 문자열 속 숫자 덩어리(쉼표 제거). "4,321만" → "4321" */
function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*/g)].map((match) => match[0].replace(/,/g, ""));
}

function expectNoInputNumbers(text: string) {
  const numbers = new Set(numbersIn(text));
  for (const forbidden of FORBIDDEN_NUMBERS) expect(numbers, `"${forbidden}"가 들어 있음`).not.toContain(forbidden);
  expect(text).not.toMatch(/\d{4}년생|1990-06-17|1990\.06\.17/);
}

function contextFor(answers: Record<string, string>) {
  const request = aiConditionRequestSchema.parse({
    policyId: NATIONAL_EMPLOYMENT.id,
    blocker: "eligibility",
    answers,
    checkedDocumentIds: [],
  });
  return buildAiContext(request, NOW);
}

async function promptFor(ruleId: string, answers: Record<string, string>): Promise<AiGenerateArgs> {
  const rule = NATIONAL_EMPLOYMENT.rules.find((item) => item.id === ruleId);
  if (!rule) throw new Error(ruleId);
  const calls: AiGenerateArgs[] = [];
  const generate: AiGenerate = async (args) => {
    calls.push(args);
    return { output: { personalNote: "공고에 나와 있지 않아요. 기관에 문의해 주세요." }, finishReason: "stop" };
  };
  await explainRule(buildExplainRequest(NATIONAL_EMPLOYMENT, rule, answers), { config, generate, now: NOW });
  expect(calls).toHaveLength(1);
  return calls[0];
}

describe("AI로 가는 경로에 사용자 입력값이 없다", () => {
  it("AI 컨텍스트(buildAiContext)에 입력한 연도·나이·개월 수·금액이 없다", () => {
    const context = contextFor(ANSWERS);
    const serialized = JSON.stringify(context);

    // 판정 상태는 담긴다(연령은 병역 기간을 더해 충족, 가구 소득은 미충족).
    const status = Object.fromEntries(context.conditions.map((item) => [item.ruleId, item.status]));
    expect(status).toMatchObject({ "nes-age": "MET", "nes-household-income": "NOT_MET" });
    expectNoInputNumbers(serialized);
    // 화면용 reason의 입력값 문장("병역 기간 18개월을 더하면", "입력한 …은", "기준보다 … 많은")이 없다.
    expect(serialized).not.toMatch(/병역 기간 \d+개월|입력한 \d|기준보다 .+ 많은/);
  });

  it("판정 상태가 같으면 입력값이 달라도 AI 컨텍스트가 완전히 같다", () => {
    expect(contextFor(OTHER_ANSWERS)).toEqual(contextFor(ANSWERS));
  });

  it.each(AI_RULE_IDS)("조건 설명(%s) 프롬프트에 입력한 연도·나이·개월 수·금액이 없다", async (ruleId) => {
    const call = await promptFor(ruleId, ANSWERS);
    expect(call.prompt).toContain("[현재 판정]");
    expectNoInputNumbers(`${call.system}\n${call.prompt}`);
  });

  it.each(AI_RULE_IDS)("판정 상태가 같으면 입력값이 달라도 %s 프롬프트가 완전히 같다", async (ruleId) => {
    const first = await promptFor(ruleId, ANSWERS);
    const second = await promptFor(ruleId, OTHER_ANSWERS);
    expect(second.prompt).toBe(first.prompt);
  });

  it("설명 캐시 키(sessionStorage)에도 입력 원값이 없고, 상태가 같으면 같은 키다", () => {
    for (const ruleId of AI_RULE_IDS) {
      const rule = NATIONAL_EMPLOYMENT.rules.find((item) => item.id === ruleId);
      if (!rule) throw new Error(ruleId);
      const key = explainCacheKey(buildExplainRequest(NATIONAL_EMPLOYMENT, rule, ANSWERS), NOW);
      const other = explainCacheKey(buildExplainRequest(NATIONAL_EMPLOYMENT, rule, OTHER_ANSWERS), NOW);
      expectNoInputNumbers(key);
      expect(other).toBe(key);
    }
  });
});
