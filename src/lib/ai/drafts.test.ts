import { APICallError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as draftsRoute } from "@/app/api/drafts/route";
import { YOUTH_RENT } from "@/data/policies/youthRent";
import { diagnose } from "@/lib/diagnosis";
import { buildInquiryDraft, buildProposalDraft } from "@/lib/drafts";
import { UNKNOWN_ANSWER } from "@/lib/rules";
import { createAiAccessStore, type KeyValueStorage } from "./access";
import { runAiStream, type AiStreamArgs, type AiStreamGenerate, type AiStreamPart } from "./client";
import type { AiConfig } from "./config";
import {
  INQUIRY_SYSTEM_PROMPT,
  PROPOSAL_SYSTEM_PROMPT,
  buildDraftGrounding,
  draftEventsToResponse,
  sanitizeParagraph,
  streamDraft,
} from "./drafts";
import { requestDraft } from "./draftsClient";
import {
  DRAFTS_PATH,
  SITUATION_PLACEHOLDER,
  buildDraftRequest,
  draftCacheKey,
  draftRequestSchema,
  fillSituation,
  type DraftRequest,
  type DraftStreamEvent,
} from "./draftsShared";
import { createExplanationCache } from "./explainClient";
import { ACCESS_CODE_HEADER, encodeAccessCode } from "./shared";

const NOW = new Date("2026-11-19T12:00:00+09:00");
const config: AiConfig = { apiKey: "test-key", model: "claude-sonnet-5-5", accessCode: "demo" };

/** 판정 결과: 주택·전입은 모르겠어요, 청년 소득은 기준 초과(미충족) */
const diagnosis = diagnose({
  policy: YOUTH_RENT,
  blocker: "unclear",
  answers: {
    birthDate: "1999-03-15",
    ownsHouse: UNKNOWN_ANSWER,
    livesApart: "yes",
    movedIn: UNKNOWN_ANSWER,
    youthHouseholdSize: "1",
    youthIncome: "300",
  },
  checkedDocumentIds: [],
  inquiryResolved: false,
  now: NOW,
});

const inquiryRequest: DraftRequest = {
  kind: "inquiry",
  policyId: "youth-rent",
  conditions: [
    { ruleId: "rent-no-house", status: "UNKNOWN", explanationViewed: true },
    { ruleId: "rent-moved-in", status: "UNKNOWN", explanationViewed: false },
  ],
};

const proposalRequest: DraftRequest = {
  kind: "proposal",
  policyId: "youth-rent",
  conditions: [{ ruleId: "rent-youth-income", status: "NOT_MET", explanationViewed: false }],
};

function mockStream(chunks: string[], finishReason = "stop") {
  const calls: AiStreamArgs[] = [];
  const stream: AiStreamGenerate = async function* (args) {
    calls.push(args);
    for (const text of chunks) yield { type: "text", text } satisfies AiStreamPart;
    yield { type: "finish", finishReason };
  };
  return { stream, calls };
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const list: T[] = [];
  for await (const event of events) list.push(event);
  return list;
}

const textOf = (events: DraftStreamEvent[]) =>
  events
    .filter((event): event is Extract<DraftStreamEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.text)
    .join("\n\n");

const INQUIRY_AI_TEXT = [
  "안녕하세요. 청년월세 지원 신청 자격과 관련하여 문의드립니다.",
  SITUATION_PLACEHOLDER,
  "[[rent-no-house]] 조건과 관련하여, 제 상황이 무주택에 해당하는지 판단하기 어렵습니다. 어떤 자료로 주택 소유 여부를 확인하시는지 알려 주실 수 있을까요?",
  "[[rent-moved-in]] 조건과 관련하여, 전입신고 시점을 어떻게 판단하시는지 궁금합니다. 신청 전에 전입을 마쳐야 하는지 안내 부탁드립니다.",
  "추가로 준비할 서류가 있다면 함께 알려 주시면 감사하겠습니다.",
  "이름: [이름]\n연락처: [연락처]",
].join("\n\n");

/** 문자열을 일정한 크기로 잘라 스트림 조각처럼 만든다(문단 경계와 무관하게). */
const chunked = (text: string, size = 17) =>
  Array.from({ length: Math.ceil(text.length / size) }, (_, index) => text.slice(index * size, (index + 1) * size));

describe("요청 형식", () => {
  it("판정 결과에서 UNKNOWN·NOT_MET 조건과 설명을 봤는지만 담는다", () => {
    const request = buildDraftRequest("inquiry", YOUTH_RENT, diagnosis.conditions, ["rent-no-house"]);
    expect(request).not.toBeNull();
    expect(draftRequestSchema.safeParse(request).success).toBe(true);
    const ids = request!.conditions.map((condition) => condition.ruleId);
    expect(ids).toEqual(expect.arrayContaining(["rent-no-house", "rent-moved-in"]));
    expect(request!.conditions.every((condition) => ["UNKNOWN", "NOT_MET"].includes(condition.status))).toBe(true);
    expect(request!.conditions.find((condition) => condition.ruleId === "rent-no-house")?.explanationViewed).toBe(true);
    expect(request!.conditions.find((condition) => condition.ruleId === "rent-moved-in")?.explanationViewed).toBe(false);
    // 입력 원값은 들어가지 않는다.
    expect(JSON.stringify(request)).not.toMatch(/1999|300/);
  });

  it("제안문은 미충족 조건만 담고, 넣을 조건이 없으면 null(템플릿만 사용)이다", () => {
    const proposal = buildDraftRequest("proposal", YOUTH_RENT, diagnosis.conditions, []);
    expect(proposal?.conditions.map((condition) => condition.ruleId)).toEqual(["rent-youth-income"]);
    const met = diagnosis.conditions.filter((condition) => condition.status === "MET");
    expect(buildDraftRequest("inquiry", YOUTH_RENT, met, [])).toBeNull();
  });

  it("메모, 입력값, 알 수 없는 규칙, 다른 상태가 섞이면 400 대상이다", () => {
    const bad = [
      { ...inquiryRequest, note: "메모 원문" },
      { ...inquiryRequest, answers: { birthDate: "1999-03-15" } },
      { ...inquiryRequest, conditions: [{ ruleId: "rent-unknown", status: "UNKNOWN", explanationViewed: false }] },
      { ...inquiryRequest, conditions: [{ ruleId: "rent-age", status: "MET", explanationViewed: false }] },
      { ...inquiryRequest, conditions: [] },
      { ...proposalRequest, conditions: [{ ruleId: "rent-no-house", status: "UNKNOWN", explanationViewed: false }] },
    ];
    for (const value of bad) expect(draftRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe("근거 (프롬프트)", () => {
  it("요청한 조건의 서버 규칙 데이터와 ruleId, 설명을 봤는지만 담는다", () => {
    const { text, labels } = buildDraftGrounding(inquiryRequest);
    expect(text).toContain("ruleId=rent-no-house");
    expect(text).toContain("ruleId=rent-moved-in");
    expect(text).toContain("설명을 읽었지만 스스로 판단하지 못함");
    expect(text).toContain("설명을 열어 보지 않음");
    expect(text).not.toContain("rent-youth-income");
    expect([...labels.keys()]).toEqual(["rent-no-house", "rent-moved-in"]);
  });

  it("시스템 프롬프트에 형식과 금지 규칙이 들어 있다", () => {
    for (const prompt of [INQUIRY_SYSTEM_PROMPT, PROPOSAL_SYSTEM_PROMPT]) {
      expect(prompt).toContain("[[ruleId]]");
      expect(prompt).toContain("[이름]");
      expect(prompt).toContain("[연락처]");
      expect(prompt).toContain(SITUATION_PLACEHOLDER);
      expect(prompt).toContain("우회하는 방법");
    }
    expect(INQUIRY_SYSTEM_PROMPT).toContain("구체적인 질문");
    expect(PROPOSAL_SYSTEM_PROMPT).toContain("사실 위주");
    expect(PROPOSAL_SYSTEM_PROMPT).toContain("과장된 표현");
  });
});

describe("streamDraft: 정상", () => {
  it("문단 단위로 검사해 내보내고, ruleId를 조건 이름으로 바꾼다", async () => {
    const { stream, calls } = mockStream(chunked(INQUIRY_AI_TEXT));
    const events = await collect(streamDraft(inquiryRequest, { config, stream }));

    expect(events.at(-1)).toEqual({ type: "done", removed: 0 });
    const text = textOf(events);
    expect(text).toContain("'무주택' 조건과 관련하여");
    expect(text).toContain("'전입신고' 조건과 관련하여");
    expect(text).not.toContain("[[");
    expect(text).toContain("이름: [이름]");
    expect(text).toContain(SITUATION_PLACEHOLDER);
    // 문단마다 따로 도착한다(스트리밍).
    expect(events.filter((event) => event.type === "text")).toHaveLength(6);

    expect(calls).toHaveLength(1);
    expect(calls[0].system).toBe(INQUIRY_SYSTEM_PROMPT);
    expect(calls[0].prompt).toContain("ruleId=rent-no-house");
  });

  it("서명이 빠졌으면 [이름]·[연락처] 빈칸을 덧붙인다", async () => {
    const { stream } = mockStream(["[[rent-youth-income]] 기준은 소득이 기준을 넘는 1인 가구 청년을 신청 대상에서 제외합니다."]);
    const events = await collect(streamDraft(proposalRequest, { config, stream }));
    expect(textOf(events).endsWith("이름: [이름]\n연락처: [연락처]")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("이메일·휴대전화 형식은 [연락처]로 가린다", () => {
    const result = sanitizeParagraph("연락처: 010-1234-5678, test@example.com", {
      kind: "inquiry",
      labels: new Map(),
      allowedNumbers: new Set(["010", "1234", "5678"]),
    });
    expect(result).toEqual({ kept: true, text: "연락처: [연락처], [연락처]", ruleIds: [] });
  });
});

describe("streamDraft: 없는 ruleId 제거", () => {
  it("정책에 없거나 요청에 없는 ruleId를 언급한 문단은 통째로 뺀다", async () => {
    const text = [
      "안녕하세요. 문의드립니다.",
      "[[rent-no-house]] 조건과 관련하여 주택 소유 여부를 어떻게 확인하시는지 궁금합니다.",
      "[[rent-made-up]] 조건도 확인 부탁드립니다.",
      "[[rent-age]] 조건과 [[rent-no-house]] 조건을 함께 봐 주세요.",
      "이름: [이름]\n연락처: [연락처]",
    ].join("\n\n");
    const { stream } = mockStream(chunked(text, 9));
    const events = await collect(streamDraft(inquiryRequest, { config, stream }));
    const output = textOf(events);

    expect(output).toContain("'무주택' 조건과 관련하여");
    expect(output).not.toContain("rent-made-up");
    expect(output).not.toContain("확인 부탁드립니다");
    // rent-age는 정책에는 있지만 이번 요청의 조건이 아니라 뺀다.
    expect(output).not.toContain("함께 봐 주세요");
    expect(events.at(-1)).toEqual({ type: "done", removed: 2 });
  });

  it("근거에 없는 숫자, 판정 코드, 우회 제안, 과장 표현이 있는 문단도 뺀다", () => {
    const { labels, text } = buildDraftGrounding(proposalRequest);
    const context = { kind: "proposal" as const, labels, allowedNumbers: new Set(text.match(/\d+/g) ?? []) };
    const kept = (paragraph: string) => sanitizeParagraph(paragraph, context).kept;

    expect(kept("[[rent-youth-income]] 기준은 소득이 조금 높은 청년을 제외합니다.")).toBe(true);
    expect(kept("[[rent-youth-income]] 기준 때문에 청년 37만 명이 제외됩니다.")).toBe(false);
    expect(kept("[[rent-youth-income]] 조건은 NOT_MET입니다.")).toBe(false);
    expect(kept("소득을 숨기면 신청할 수 있습니다.")).toBe(false);
    expect(kept("이 기준은 최악의 제도입니다")).toBe(false);
    expect(kept("정말 부당합니다!")).toBe(false);
  });

  it("조건 문단이 하나도 남지 않으면 실패로 끝나 템플릿을 쓰게 한다", async () => {
    const { stream } = mockStream(["안녕하세요.\n\n[[rent-made-up]] 조건을 확인해 주세요.\n\n감사합니다."]);
    const events = await collect(streamDraft(inquiryRequest, { config, stream }));
    expect(events.at(-1)).toMatchObject({ type: "error", reason: "invalid_output" });
  });
});

describe("streamDraft: 실패", () => {
  it("키가 없으면 AI를 부르지 않고 error다", async () => {
    const { stream, calls } = mockStream(["x"]);
    const events = await collect(streamDraft(inquiryRequest, { config: { ...config, apiKey: null }, stream }));
    expect(events).toEqual([expect.objectContaining({ type: "error", reason: "missing_key" })]);
    expect(calls).toHaveLength(0);
  });

  it("429, 중간 끊김, 시간 초과, 거절, 길이 초과도 예외 없이 error로 끝난다", async () => {
    const rateLimited: AiStreamGenerate = async function* () {
      yield {
        type: "error",
        error: new APICallError({
          message: "rate limited",
          url: "https://api.anthropic.com/v1/messages",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        }),
      };
    };
    const thrown: AiStreamGenerate = async function* () {
      yield { type: "text", text: "안녕하세요.\n\n" };
      throw new Error("socket hang up");
    };
    const hanging: AiStreamGenerate = async function* () {
      yield { type: "text", text: "안녕하세요." };
      await new Promise(() => {});
    };

    const last = async (stream: AiStreamGenerate, timeoutMs?: number) =>
      (await collect(streamDraft(inquiryRequest, { config, stream, timeoutMs }))).at(-1);

    expect(await last(rateLimited)).toMatchObject({ type: "error", reason: "rate_limited" });
    expect(await last(thrown)).toMatchObject({ type: "error", reason: "unavailable" });
    expect(await last(hanging, 20)).toMatchObject({ type: "error", reason: "timeout" });
    expect(await last(mockStream([INQUIRY_AI_TEXT], "content-filter").stream)).toMatchObject({
      type: "error",
      reason: "refused",
    });
    expect(await last(mockStream([INQUIRY_AI_TEXT], "length").stream)).toMatchObject({
      type: "error",
      reason: "invalid_output",
    });
  });

  it("runAiStream은 첫 조각이 8초 안에 오지 않으면 시간 초과다", async () => {
    vi.useFakeTimers();
    try {
      const hanging: AiStreamGenerate = async function* () {
        await new Promise(() => {});
      };
      const pending = collect(runAiStream({ system: "s", prompt: "p" }, { config, stream: hanging }));
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await pending).toEqual([expect.objectContaining({ type: "error", reason: "timeout" })]);
    } finally {
      vi.useRealTimers();
    }
  });
});

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setupClient({ access = true } = {}) {
  const storage = memoryStorage();
  const store = createAiAccessStore(() => storage);
  if (access) {
    store.giveConsent();
    store.setAccessCode("demo");
  }
  return { storage, store, cache: createExplanationCache(() => storage) };
}

/** 서버의 streamDraft 결과를 실제 NDJSON 응답으로 만들어 브라우저 쪽에 넘긴다. */
const fetchFromStream = (stream: AiStreamGenerate) =>
  vi.fn(async () => draftEventsToResponse(streamDraft(inquiryRequest, { config, stream })));

describe("requestDraft (브라우저)", () => {
  it("문단이 올 때마다 onText로 알려주고, 끝나면 초안을 저장한다", async () => {
    const { store, cache, storage } = setupClient();
    const fetchImpl = fetchFromStream(mockStream(chunked(INQUIRY_AI_TEXT)).stream);
    const seen: string[] = [];

    const result = await requestDraft(inquiryRequest, { store, cache, fetchImpl, onText: (text) => seen.push(text) });

    expect(result).toMatchObject({ kind: "ready", cached: false, removed: 0 });
    expect(seen.length).toBe(6);
    expect(seen[0]).toContain("안녕하세요");
    expect(seen.at(-1)).toBe(result.kind === "ready" ? result.text : "");
    expect(fetchImpl).toHaveBeenCalledWith(DRAFTS_PATH, expect.anything());
    expect(storage.data.get(draftCacheKey(inquiryRequest))).toContain("'무주택'");

    // 같은 요청이면 다시 부르지 않는다.
    expect(await requestDraft(inquiryRequest, { store, cache, fetchImpl })).toMatchObject({ kind: "ready", cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("AI가 중간에 실패하면 failed이고 저장하지 않는다(화면은 템플릿으로 대체)", async () => {
    const { store, cache } = setupClient();
    const broken: AiStreamGenerate = async function* () {
      yield { type: "text", text: "안녕하세요.\n\n[[rent-no-house]] 조건이 궁금합니다.\n\n" };
      yield { type: "error", error: new Error("overloaded") };
    };
    const seen: string[] = [];
    const result = await requestDraft(inquiryRequest, {
      store,
      cache,
      fetchImpl: fetchFromStream(broken),
      onText: (text) => seen.push(text),
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ kind: "failed", needsCode: false });
    expect(cache.get(draftCacheKey(inquiryRequest))).toBeNull();
  });

  it("접근 코드가 없으면 부르지 않고, 틀리면 코드를 지운다", async () => {
    const none = setupClient({ access: false });
    const fetchImpl = vi.fn();
    expect(await requestDraft(inquiryRequest, { ...none, fetchImpl })).toEqual({ kind: "no_access" });
    expect(fetchImpl).not.toHaveBeenCalled();

    const wrong = setupClient();
    const unauthorized = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: "invalid_access_code", message: "틀렸어요" } }), { status: 401 }),
    );
    expect(await requestDraft(inquiryRequest, { ...wrong, fetchImpl: unauthorized })).toEqual({
      kind: "failed",
      message: "틀렸어요",
      needsCode: true,
    });
    expect(wrong.store.getAccessCode()).toBeNull();
  });

  it("done 없이 끊긴 스트림은 쓰지 않는다", async () => {
    const { store, cache } = setupClient();
    const cut = vi.fn(async () => new Response(`${JSON.stringify({ type: "text", text: "안녕하세요." })}\n`));
    expect(await requestDraft(inquiryRequest, { store, cache, fetchImpl: cut })).toMatchObject({ kind: "failed" });
  });
});

describe("템플릿 대체", () => {
  it("대체용 템플릿은 지금의 고정 템플릿과 같다", () => {
    const inquiry = buildInquiryDraft(YOUTH_RENT, "", "", diagnosis.conditions);
    expect(inquiry).toContain("안녕하세요.");
    expect(inquiry).toContain("- 무주택");
    expect(buildProposalDraft(YOUTH_RENT, diagnosis.conditions, "")).toContain("1. 제안 배경");
  });

  it("메모는 브라우저에서만 [상세 상황] 자리에 넣는다", () => {
    expect(fillSituation(`가\n\n${SITUATION_PLACEHOLDER}\n\n나`, "부모님과 따로 살아요")).toBe(
      "가\n\n부모님과 따로 살아요\n\n나",
    );
    expect(fillSituation(`가\n\n${SITUATION_PLACEHOLDER}`, "  ")).toBe(`가\n\n${SITUATION_PLACEHOLDER}`);
    expect(fillSituation("가\n\n이름: [이름]", "메모")).toBe("가\n\n상세 상황: 메모\n\n이름: [이름]");
  });
});

describe("POST /api/drafts (guard 연결)", () => {
  afterEach(() => vi.unstubAllEnvs());

  const post = (ip: string, body: unknown, code: string | null = "demo") =>
    draftsRoute(
      new Request("http://localhost/api/drafts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          ...(code ? { [ACCESS_CODE_HEADER]: encodeAccessCode(code) } : {}),
        },
        body: JSON.stringify(body),
      }),
    );

  it("접근 코드가 없으면 401, 메모가 섞이면 400이다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "demo");
    expect((await post("192.0.2.40", inquiryRequest, null)).status).toBe(401);
    expect((await post("192.0.2.41", { ...inquiryRequest, note: "메모" })).status).toBe(400);
  });

  it("키가 없으면 200 스트림의 error 이벤트로 알린다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "demo");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await post("192.0.2.42", inquiryRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([expect.objectContaining({ type: "error", reason: "missing_key" })]);
  });
});
