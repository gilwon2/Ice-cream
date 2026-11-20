import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as recommendationsRoute } from "@/app/api/policy-recommendations/route";
import { NATIONAL_EMPLOYMENT } from "@/data/policies/nationalEmployment";
import { YOUTH_RENT } from "@/data/policies/youthRent";
import { recommendationResponseSchema } from "./recommendationsShared";
import {
  ALLOWED_QUERY_KEYS,
  CODES,
  YOUTH_POLICY_CACHE_MS,
  buildRequestUrl,
  cleanText,
  clearRecommendationCache,
  describePeriod,
  getRecommendations,
  isRelevant,
  maskUrl,
  parseYouthPolicyResponse,
  readYouthPolicyKey,
  safeUrl,
  selectRecommendations,
  type GetRecommendationsOptions,
} from "./youthPolicy";

/* 가짜 키. 실제 인증키는 테스트에 넣지 않는다. */
const FAKE_KEY = "fake-test-key-0000";
const ENV = { YOUTH_POLICY_API_KEY: FAKE_KEY };
/** 2026-11-20 12:00 KST */
const NOW = new Date("2026-11-20T03:00:00Z");

/** 2026-11-20 실제 응답의 항목 구조를 본뜬 가짜 정책. 판정용 필드도 실제처럼 섞어 둔다. */
function rawPolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    plcyNo: "20260000000000000001",
    bscPlanCycl: "1",
    pvsnInstGroupCd: CODES.centralGovernment,
    plcyPvsnMthdCd: "0042002",
    plcyAprvSttsCd: CODES.approved,
    plcyNm: "가상 청년 취업 지원",
    plcyKywdNm: "맞춤형상담서비스",
    plcyExplnCn: "가상의 정책 설명이에요.",
    lclsfNm: "일자리",
    mclsfNm: "취업",
    plcySprtCn: "❍ 1:1 맞춤형 취업 상담\r\n\r\n❍ 취업 연계",
    sprvsnInstCd: "0000000",
    sprvsnInstCdNm: "가상부",
    sprvsnInstPicNm: "",
    aplyPrdSeCd: CODES.periodAlways,
    bizPrdSeCd: "0056001",
    aplyUrlAddr: "https://example.go.kr/apply",
    refUrlAddr1: "",
    refUrlAddr2: "",
    sprtTrgtMinAge: "19",
    sprtTrgtMaxAge: "34",
    sprtTrgtAgeLmtYn: "N",
    mrgSttsCd: "0055003",
    earnCndSeCd: "0043002",
    earnMinAmt: "0",
    earnMaxAmt: "5000",
    earnEtcCn: "가상 소득 기준",
    addAplyQlfcCndCn: "가상 추가 자격",
    ptcpPrpTrgtCn: "",
    rgtrHghrkInstCdNm: "정부산하기관및위원회",
    zipCd: "11000",
    jobCd: "0013003",
    schoolCd: "0049010",
    aplyYmd: "",
    frstRegDt: "2026-11-01 10:00:00",
    lastMdfcnDt: "2026-11-01 10:00:00",
    sbizCd: "0014010",
    ...overrides,
  };
}

function apiBody(list: Record<string, unknown>[], resultCode: number = 200) {
  return {
    resultCode,
    resultMessage: "성공적으로 데이터를 가지고 왔습니다.",
    result: {
      pagging: { totCount: list.length, pageNum: 1, pageSize: 50 },
      youthPolicyList: list,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** 호출 주소를 기록하는 가짜 fetch */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: string) => {
    calls.push(input);
    return respond();
  });
  return { fn, calls };
}

function options(extra: GetRecommendationsOptions = {}): GetRecommendationsOptions {
  return { env: ENV, now: () => NOW, log: () => {}, ...extra };
}

beforeEach(() => clearRecommendationCache());

describe("요청 주소", () => {
  it("정책 분야와 고정 값만 넣는다", () => {
    const url = buildRequestUrl(NATIONAL_EMPLOYMENT.recommendation, FAKE_KEY);
    expect(url.origin + url.pathname).toBe("https://www.youthcenter.go.kr/go/ythip/getPlcy");
    expect([...url.searchParams.keys()].sort()).toEqual([...ALLOWED_QUERY_KEYS].sort());
    expect(url.searchParams.get("lclsfNm")).toBe("일자리");
    expect(url.searchParams.get("mclsfNm")).toBe("취업");
    expect(url.searchParams.get("rtnType")).toBe("json");
    expect(url.searchParams.has("zipCd")).toBe(false);
  });

  it("청년월세는 공백 없는 중분류 검색어를 보낸다 (공백이 든 분류명은 서버가 0건을 줘서)", () => {
    const url = buildRequestUrl(YOUTH_RENT.recommendation, FAKE_KEY);
    expect(url.searchParams.get("lclsfNm")).toBe("주거");
    expect(url.searchParams.get("mclsfNm")).toBe("전월세");
  });

  it("실제 호출 주소에 사용자 입력값이 없다", async () => {
    // 화면에서 받을 수 있는 가상의 입력값. 어떤 경로로도 요청에 들어가면 안 된다.
    const userValues = ["1999-03-15", "19990315", "1999", "250", "2500000", "3", "서울특별시", "강남구", "11680"];
    const { fn, calls } = fakeFetch(() => jsonResponse(apiBody([rawPolicy()])));
    await getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn }));
    await getRecommendations(YOUTH_RENT, options({ fetch: fn }));

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const url = new URL(call);
      expect([...url.searchParams.keys()].sort()).toEqual([...ALLOWED_QUERY_KEYS].sort());
      const values = [...url.searchParams.entries()]
        .filter(([key]) => key !== "apiKeyNm")
        .map(([, value]) => value);
      for (const value of values) {
        expect(userValues).not.toContain(value);
      }
      expect(values).toEqual(expect.arrayContaining(["1", "50", "json"]));
    }
  });

  it("요청을 만드는 함수는 정책 분류와 키만 받는다", () => {
    // 인자가 늘어나면(예: answers) 사용자 입력이 들어갈 길이 생기므로 막는다.
    expect(buildRequestUrl.length).toBe(2);
    expect(getRecommendations.length).toBe(1);
  });
});

describe("인증키", () => {
  it("YOUTH_POLICY_API_KEY만 읽고 NEXT_PUBLIC_ 변수는 읽지 않는다", () => {
    expect(readYouthPolicyKey({ YOUTH_POLICY_API_KEY: "  abc  " })).toBe("abc");
    expect(readYouthPolicyKey({ YOUTH_POLICY_API_KEY: "   " })).toBeNull();
    expect(readYouthPolicyKey({ NEXT_PUBLIC_YOUTH_POLICY_API_KEY: "abc" })).toBeNull();
  });

  it("로그용 주소에서 키를 가린다", () => {
    const masked = maskUrl(buildRequestUrl(YOUTH_RENT.recommendation, FAKE_KEY));
    expect(masked).not.toContain(FAKE_KEY);
    expect(masked).toContain("apiKeyNm=***");
  });

  it("실패 로그와 오류 메시지에 키가 남지 않는다", async () => {
    const logs: string[] = [];
    const leaky = vi.fn(async (input: string) => {
      throw new TypeError(`fetch failed for ${input}`);
    });
    const result = await getRecommendations(
      YOUTH_RENT,
      options({ fetch: leaky, log: (message) => logs.push(message) }),
    );
    expect(result.source).toBe("fallback");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("network_error");
    expect(logs[0]).not.toContain(FAKE_KEY);
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
  });

  it("기본 로그(console.warn)에도 키가 남지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await getRecommendations(YOUTH_RENT, {
        env: ENV,
        now: () => NOW,
        fetch: async () => jsonResponse({ errorCode: "e001", errorMsg: "invalid api key." }, 403),
      });
      const printed = warn.mock.calls.flat().join(" ");
      expect(printed).toContain("http_error");
      expect(printed).not.toContain(FAKE_KEY);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("응답 파싱", () => {
  it("실제 구조(resultCode / result.pagging / result.youthPolicyList)를 읽고 카드에 쓸 필드만 남긴다", () => {
    const parsed = parseYouthPolicyResponse(apiBody([rawPolicy(), rawPolicy({ plcyNo: "2" })]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.totalCount).toBe(2);
    expect(parsed.items).toHaveLength(2);
    // 판정에 쓸 수 있는 필드는 꺼내지 않는다.
    for (const key of ["sprtTrgtMinAge", "sprtTrgtMaxAge", "earnMaxAmt", "earnEtcCn", "addAplyQlfcCndCn", "zipCd", "jobCd"]) {
      expect(parsed.items[0]).not.toHaveProperty(key);
    }
  });

  it("형식이 틀린 항목은 버리고 나머지는 쓴다", () => {
    const parsed = parseYouthPolicyResponse(
      apiBody([rawPolicy(), { plcyNo: 123 }, rawPolicy({ plcyNm: "" })]),
    );
    expect(parsed.ok && parsed.items).toHaveLength(1);
  });

  it("결과가 없으면 빈 목록, 구조가 다르거나 오류 코드면 실패", () => {
    expect(parseYouthPolicyResponse({ resultCode: 200, resultMessage: "", result: { pagging: { totCount: 0, pageNum: 1, pageSize: 50 } } })).toEqual({
      ok: true,
      items: [],
      totalCount: 0,
    });
    expect(parseYouthPolicyResponse({ errorCode: "e001", errorMsg: "invalid api key." })).toEqual({
      ok: false,
      reason: "invalid_response",
    });
    expect(parseYouthPolicyResponse(apiBody([], 500))).toEqual({ ok: false, reason: "api_error" });
    expect(parseYouthPolicyResponse("<html>")).toEqual({ ok: false, reason: "invalid_response" });
  });
});

describe("고르기", () => {
  const pick = (list: Record<string, unknown>[], policy = NATIONAL_EMPLOYMENT) => {
    const parsed = parseYouthPolicyResponse(apiBody(list));
    if (!parsed.ok) throw new Error("parse failed");
    return selectRecommendations(parsed.items, policy.recommendation, NOW);
  };

  it("승인된 정책만 보여준다", () => {
    const cards = pick([
      rawPolicy({ plcyNo: "a", plcyNm: "승인 정책" }),
      rawPolicy({ plcyNo: "b", plcyNm: "신청 상태", plcyAprvSttsCd: "0044001" }),
      rawPolicy({ plcyNo: "c", plcyNm: "반려 상태", plcyAprvSttsCd: "0044003" }),
    ]);
    expect(cards.map((card) => card.id)).toEqual(["a"]);
  });

  it("마감 코드와 종료일이 지난 정책은 뺀다", () => {
    const cards = pick([
      rawPolicy({ plcyNo: "closed", plcyNm: "마감 정책", aplyPrdSeCd: CODES.periodClosed }),
      rawPolicy({ plcyNo: "past", plcyNm: "지난 정책", aplyPrdSeCd: CODES.periodSpecific, aplyYmd: "20251013 ~ 20251024" }),
      rawPolicy({ plcyNo: "yesterday", plcyNm: "어제 끝남", aplyPrdSeCd: CODES.periodSpecific, aplyYmd: "20261101 ~ 20261119" }),
      rawPolicy({ plcyNo: "today", plcyNm: "오늘 끝남", aplyPrdSeCd: CODES.periodSpecific, aplyYmd: "20261101 ~ 20261120" }),
      rawPolicy({ plcyNo: "open", plcyNm: "진행 중", aplyPrdSeCd: CODES.periodSpecific, aplyYmd: "20260101 ~ 20261231" }),
      rawPolicy({ plcyNo: "odd", plcyNm: "형식 다름", aplyPrdSeCd: CODES.periodSpecific, aplyYmd: "예산 소진 시까지" }),
    ]);
    expect(cards.map((card) => card.id).sort()).toEqual(["odd", "open", "today"]);
  });

  it("지금 진단 중인 정책과 같은 정책은 뺀다", () => {
    const employment = pick([
      rawPolicy({ plcyNo: "same", plcyNm: "국민취업지원제도" }),
      rawPolicy({ plcyNo: "same2", plcyNm: "국민 취업지원제도 (제주)" }),
      rawPolicy({ plcyNo: "other", plcyNm: "청년 일자리 상담" }),
    ]);
    expect(employment.map((card) => card.id)).toEqual(["other"]);

    const housing = { lclsfNm: "주거", mclsfNm: "전월세 및 주거급여 지원" };
    const rent = pick(
      [
        rawPolicy({ ...housing, plcyNo: "r1", plcyNm: "청년월세 지원" }),
        rawPolicy({ ...housing, plcyNo: "r2", plcyNm: "청년월세 한시 특별지원" }),
        rawPolicy({ ...housing, plcyNo: "r3", plcyNm: "구미형 청년월세 지원사업" }),
        rawPolicy({ ...housing, plcyNo: "r4", plcyNm: "청년 전세보증금 이자 지원" }),
      ],
      YOUTH_RENT,
    );
    expect(rent.map((card) => card.id).sort()).toEqual(["r3", "r4"]);
  });

  it("다른 중분류와 이름이 같은 중복은 빼고 최대 4개만 보여준다", () => {
    const list = [
      rawPolicy({ plcyNo: "x", plcyNm: "재직자 정책", mclsfNm: "재직자" }),
      rawPolicy({ plcyNo: "d1", plcyNm: "중복 정책" }),
      rawPolicy({ plcyNo: "d2", plcyNm: "중복  정책" }),
      ...Array.from({ length: 6 }, (_, index) => rawPolicy({ plcyNo: `n${index}`, plcyNm: `정책 ${index}` })),
    ];
    const cards = pick(list);
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.id)).not.toContain("x");
    expect(cards.map((card) => card.id)).not.toContain("d2");
  });

  it("링크 있는 정책, 중앙부처, 상시 접수 순으로 앞에 둔다", () => {
    const cards = pick([
      rawPolicy({ plcyNo: "nolink", plcyNm: "링크 없음", aplyUrlAddr: "", refUrlAddr1: "" }),
      rawPolicy({ plcyNo: "local", plcyNm: "지자체", pvsnInstGroupCd: CODES.localGovernment }),
      rawPolicy({ plcyNo: "central", plcyNm: "중앙부처" }),
    ]);
    expect(cards.map((card) => card.id)).toEqual(["central", "local", "nolink"]);
  });

  it("카드에는 정책명, 기관, 지역, 요약, 신청기간, 링크, 출처가 들어간다", () => {
    const [card] = pick([
      rawPolicy({
        plcyNo: "c1",
        plcyNm: "<b>청년</b> 일자리 상담",
        sprvsnInstCdNm: "일자리경제과",
        rgtrHghrkInstCdNm: "충청남도",
        pvsnInstGroupCd: CODES.localGovernment,
        aplyPrdSeCd: CODES.periodSpecific,
        aplyYmd: "20260101 ~ 20261231",
        aplyUrlAddr: "",
        refUrlAddr1: "youth.example.go.kr/view?id=1",
      }),
    ]);
    expect(card).toEqual({
      id: "c1",
      title: "청년 일자리 상담",
      agency: "일자리경제과",
      region: "충청남도",
      summary: "1:1 맞춤형 취업 상담 취업 연계",
      period: "2026.01.01 ~ 2026.12.31",
      url: "https://youth.example.go.kr/view?id=1",
      sourceName: "온통청년(한국고용정보원)",
    });
  });

  describe("분야 관련 낱말로 순서 보완", () => {
    const housing = { lclsfNm: "주거", mclsfNm: "전월세 및 주거급여 지원" };

    it("주거와 관계없는 항목(교통 정책)은 뒤로 보내되 빼지는 않는다", () => {
      // 2026-11-20 실제 응답에서 본 경우: 교통 정책이 "전월세 및 주거급여 지원"으로 분류돼 있었다.
      const cards = pick(
        [
          rawPolicy({ ...housing, plcyNo: "bus", plcyNm: "대중교통 활성화 및 교통서비스 개선", plcyKywdNm: "보조금" }),
          rawPolicy({ ...housing, plcyNo: "kw", plcyNm: "신혼부부 대출이자 지원", plcyKywdNm: "주거지원" }),
          rawPolicy({ ...housing, plcyNo: "name", plcyNm: "청년 주거 임차비 지원", plcyKywdNm: "보조금" }),
          rawPolicy({ ...housing, plcyNo: "lease", plcyNm: "청년희망주택 임대료 지원", plcyKywdNm: "" }),
        ],
        YOUTH_RENT,
      );
      expect(cards.map((card) => card.id)).toEqual(["kw", "name", "lease", "bus"]);
    });

    it("관련 낱말이 링크·중앙부처·상시 접수보다 먼저다", () => {
      const cards = pick(
        [
          rawPolicy({ ...housing, plcyNo: "bus", plcyNm: "교통비 지원", plcyKywdNm: "보조금" }),
          rawPolicy({
            ...housing,
            plcyNo: "rent",
            plcyNm: "청년 전세보증금 이자 지원",
            pvsnInstGroupCd: CODES.localGovernment,
            aplyPrdSeCd: CODES.periodSpecific,
            aplyYmd: "20260101 ~ 20261231",
            aplyUrlAddr: "",
            refUrlAddr1: "",
          }),
        ],
        YOUTH_RENT,
      );
      expect(cards.map((card) => card.id)).toEqual(["rent", "bus"]);
    });

    it("관련 항목이 4개를 넘으면 관계없는 항목은 자리에서 밀린다", () => {
      const cards = pick(
        [
          rawPolicy({ ...housing, plcyNo: "bus", plcyNm: "교통비 지원", plcyKywdNm: "보조금" }),
          ...Array.from({ length: 4 }, (_, index) =>
            rawPolicy({ ...housing, plcyNo: `h${index}`, plcyNm: `주거비 지원 ${index}`, plcyKywdNm: "주거지원" }),
          ),
        ],
        YOUTH_RENT,
      );
      expect(cards.map((card) => card.id)).toEqual(["h0", "h1", "h2", "h3"]);
    });

    it("일자리 분야도 같은 방식으로 정렬한다", () => {
      const cards = pick([
        rawPolicy({ plcyNo: "farm", plcyNm: "친환경청년농부 시설지원", plcyKywdNm: "보조금" }),
        rawPolicy({ plcyNo: "robot", plcyNm: "글로벌 AI로봇 해커톤 개최 지원", plcyKywdNm: "교육지원" }),
        rawPolicy({ plcyNo: "center", plcyNm: "충남일자리종합센터 운영", plcyKywdNm: "맞춤형상담서비스" }),
        rawPolicy({ plcyNo: "public", plcyNm: "공공근로 사업", plcyKywdNm: "인턴,장기미취업청년" }),
      ]);
      expect(cards.map((card) => card.id)).toEqual(["center", "public", "farm", "robot"]);
    });

    it("정책명과 키워드만 보고, 모든 결과가 같은 중분류명은 보지 않는다", () => {
      const category = YOUTH_RENT.recommendation;
      expect(isRelevant({ plcyNm: "대중교통 활성화", plcyKywdNm: "보조금" }, category)).toBe(false);
      expect(isRelevant({ plcyNm: "신혼부부 대출이자", plcyKywdNm: "보조금,주거지원" }, category)).toBe(true);
      expect(isRelevant({ plcyNm: "청년 전 세 보증금", plcyKywdNm: "" }, category)).toBe(true);
      // 중분류명("전월세 및 주거급여 지원")에는 "주거"와 "월세"가 있지만 판단에 쓰지 않는다.
      const withSubcategory = { plcyNm: "대중교통 활성화", plcyKywdNm: "보조금", mclsfNm: "전월세 및 주거급여 지원" };
      expect(isRelevant(withSubcategory, category)).toBe(false);
    });
  });

  it("신청기간이 없으면 코드의 뜻을 쓴다", () => {
    expect(describePeriod({ aplyYmd: "", aplyPrdSeCd: CODES.periodAlways })).toBe("상시");
    expect(describePeriod({ aplyYmd: "", aplyPrdSeCd: CODES.periodSpecific })).toBe("특정 기간 (공고에서 확인해요)");
    expect(describePeriod({ aplyYmd: "", aplyPrdSeCd: "" })).toBe("공고에서 확인해요");
  });
});

describe("텍스트 정리", () => {
  it("HTML 태그, 엔티티, 머리 기호, 줄바꿈과 연속 공백을 정리한다", () => {
    expect(cleanText("<p>❍ 지원&nbsp;금액&amp;기간</p>\r\n\r\n<br/>  ○ 최대   5억원")).toBe(
      "지원 금액&기간 최대 5억원",
    );
    expect(cleanText("&lt;script&gt;alert(1)&lt;/script&gt;안내")).toBe("alert(1) 안내");
    // 실제 응답에서 본 머리 기호. 낱말 안의 가운뎃점과 하이픈은 남긴다.
    expect(cleanText("ㆍ신기술 도입, 시설ㆍ장비 지원\r\nㆍ농산물 유통")).toBe("신기술 도입, 시설ㆍ장비 지원 농산물 유통");
    expect(cleanText("- 공공형 택시: 보상금\n- 공공형 버스: 1-2년")).toBe("공공형 택시: 보상금 공공형 버스: 1-2년");
  });

  it("너무 긴 글은 자른다", () => {
    const text = cleanText("가".repeat(300));
    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("링크", () => {
  it("http/https만 허용한다", () => {
    expect(safeUrl("https://www.work24.go.kr/path?a=1")).toBe("https://www.work24.go.kr/path?a=1");
    expect(safeUrl("http://www.cnsp.or.kr")).toBe("http://www.cnsp.or.kr/");
  });

  it("스킴 없는 도메인은 https://를 붙인다", () => {
    expect(safeUrl("www.dgyouth.kr")).toBe("https://www.dgyouth.kr/");
    expect(safeUrl("plus.gov.kr/path?x=1")).toBe("https://plus.gov.kr/path?x=1");
    expect(safeUrl(" www.hf.go.kr ")).toBe("https://www.hf.go.kr/");
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.go.kr",
    "//evil.example.com",
    "https://evil.example.com /x",
    "https://user:pass@example.go.kr",
    "java\nscript:alert(1)",
    "localhost",
    "홈페이지 참고",
    "",
  ])("위험하거나 잘못된 링크 %j는 막는다", (value) => {
    expect(safeUrl(value)).toBeNull();
  });

  it("신청 링크가 위험하면 참고 링크를 쓴다", () => {
    const parsed = parseYouthPolicyResponse(
      apiBody([rawPolicy({ aplyUrlAddr: "javascript:alert(1)", refUrlAddr1: "https://ref.example.go.kr" })]),
    );
    if (!parsed.ok) throw new Error("parse failed");
    const [card] = selectRecommendations(parsed.items, NATIONAL_EMPLOYMENT.recommendation, NOW);
    expect(card.url).toBe("https://ref.example.go.kr/");
  });
});

describe("대체 목록", () => {
  it("키가 없으면 호출하지 않고 대체 목록을 준다", async () => {
    const { fn } = fakeFetch(() => jsonResponse(apiBody([rawPolicy()])));
    const result = await getRecommendations(NATIONAL_EMPLOYMENT, options({ env: {}, fetch: fn }));
    expect(fn).not.toHaveBeenCalled();
    expect(result.source).toBe("fallback");
    expect(result.items.map((item) => item.id)).toEqual([
      "national-employment-type-2",
      "browse-national-employment",
    ]);
    expect(result.items[0].sourceName).toContain("고용24");
    expect(result.items[1].sourceName).toBe("온통청년");
  });

  it("시간 초과면 대체 목록을 준다", async () => {
    const hanging = vi.fn(
      (_input: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const logs: string[] = [];
    const result = await getRecommendations(
      YOUTH_RENT,
      options({ fetch: hanging, timeoutMs: 20, log: (message) => logs.push(message) }),
    );
    expect(result.source).toBe("fallback");
    expect(result.items.map((item) => item.id)).toEqual(["browse-youth-rent"]);
    expect(logs[0]).toContain("timeout");
  });

  it("signal을 무시하는 fetch도 시간 초과로 끊는다", async () => {
    const neverEnds = vi.fn(() => new Promise<Response>(() => {}));
    const result = await getRecommendations(YOUTH_RENT, options({ fetch: neverEnds, timeoutMs: 20 }));
    expect(result.source).toBe("fallback");
  });

  it.each([
    ["HTTP 403 (인증 오류)", () => jsonResponse({ errorCode: "e001", errorMsg: "invalid api key." }, 403)],
    ["HTTP 500", () => new Response("error", { status: 500 })],
    ["JSON이 아닌 응답", () => new Response("<html></html>", { status: 200 })],
    ["다른 구조", () => jsonResponse({ unexpected: true })],
    ["resultCode 오류", () => jsonResponse(apiBody([rawPolicy()], 500))],
  ])("오류(%s)면 대체 목록을 준다", async (_label, respond) => {
    const result = await getRecommendations(YOUTH_RENT, options({ fetch: fakeFetch(respond).fn }));
    expect(result.source).toBe("fallback");
    expect(recommendationResponseSchema.safeParse(result).success).toBe(true);
  });

  it("결과가 0건이거나 거르고 남은 것이 없으면 대체 목록을 준다", async () => {
    const empty = await getRecommendations(
      YOUTH_RENT,
      options({ fetch: fakeFetch(() => jsonResponse(apiBody([]))).fn }),
    );
    expect(empty.source).toBe("fallback");

    clearRecommendationCache();
    const allClosed = await getRecommendations(
      NATIONAL_EMPLOYMENT,
      options({
        fetch: fakeFetch(() => jsonResponse(apiBody([rawPolicy({ aplyPrdSeCd: CODES.periodClosed })]))).fn,
      }),
    );
    expect(allClosed.source).toBe("fallback");
  });
});

describe("정상 응답과 캐시", () => {
  it("정상 응답은 source: api와 조회 시각을 준다", async () => {
    const { fn } = fakeFetch(() => jsonResponse(apiBody([rawPolicy({ plcyNo: "ok" })])));
    const result = await getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn }));
    expect(result).toMatchObject({ source: "api", fetchedAt: NOW.toISOString() });
    expect(result.items.map((item) => item.id)).toEqual(["ok"]);
    expect(recommendationResponseSchema.safeParse(result).success).toBe(true);
  });

  it("같은 검색은 1시간 동안 다시 호출하지 않는다", async () => {
    let now = NOW;
    const { fn } = fakeFetch(() => jsonResponse(apiBody([rawPolicy()])));
    const run = () => getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn, now: () => now }));

    await run();
    await run();
    expect(fn).toHaveBeenCalledTimes(1);

    now = new Date(NOW.getTime() + YOUTH_POLICY_CACHE_MS - 1);
    await run();
    expect(fn).toHaveBeenCalledTimes(1);

    now = new Date(NOW.getTime() + YOUTH_POLICY_CACHE_MS + 1);
    await run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("동시에 들어온 같은 검색은 한 번만 호출한다", async () => {
    const { fn } = fakeFetch(() => jsonResponse(apiBody([rawPolicy()])));
    await Promise.all([
      getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn })),
      getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn })),
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("대체 목록은 캐시하지 않아 다음 요청에서 다시 시도한다", async () => {
    let fail = true;
    const { fn } = fakeFetch(() =>
      fail ? new Response("error", { status: 503 }) : jsonResponse(apiBody([rawPolicy()])),
    );
    expect((await getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn }))).source).toBe("fallback");
    fail = false;
    expect((await getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn }))).source).toBe("api");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("정책마다 따로 캐시한다", async () => {
    const { fn } = fakeFetch(() =>
      jsonResponse(apiBody([rawPolicy(), rawPolicy({ plcyNo: "h", lclsfNm: "주거", mclsfNm: "전월세 및 주거급여 지원", plcyNm: "가상 주거 지원" })])),
    );
    await getRecommendations(NATIONAL_EMPLOYMENT, options({ fetch: fn }));
    await getRecommendations(YOUTH_RENT, options({ fetch: fn }));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("라우트", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("알 수 없는 정책 ID는 400", async () => {
    for (const query of ["", "?policyId=", "?policyId=unknown", "?policyId=__proto__"]) {
      const response = await recommendationsRoute(new Request(`http://localhost/api/policy-recommendations${query}`));
      expect(response.status).toBe(400);
    }
  });

  it("키가 없으면 200과 대체 목록을 주고, 다른 쿼리 값은 쓰지 않는다", async () => {
    vi.stubEnv("YOUTH_POLICY_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await recommendationsRoute(
        new Request("http://localhost/api/policy-recommendations?policyId=youth-rent&birthDate=1999-03-15&zipCd=11680"),
      );
      expect(response.status).toBe(200);
      const body = recommendationResponseSchema.parse(await response.json());
      expect(body.source).toBe("fallback");
      expect(body.items[0].url).toBe("https://www.youthcenter.go.kr");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("범위: 추천에만 쓴다", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const read = (path: string) => readFileSync(join(root, path), "utf8");

  it("온통청년 모듈은 AI 모듈을 import하지 않는다", () => {
    for (const file of ["lib/policyApi/youthPolicy.ts", "lib/policyApi/recommendationsShared.ts", "app/api/policy-recommendations/route.ts"]) {
      expect(read(file)).not.toMatch(/from\s+["']@\/lib\/ai/);
    }
  });

  it("AI 모듈과 판정 엔진은 온통청년 데이터를 import하지 않는다", () => {
    for (const dir of ["lib/ai", "lib/rules"]) {
      for (const file of readdirSync(join(root, dir)).filter((name) => name.endsWith(".ts"))) {
        expect(read(`${dir}/${file}`), `${dir}/${file}`).not.toMatch(/policyApi|policyRecommendations/);
      }
    }
    expect(read("lib/diagnosis.ts")).not.toMatch(/policyApi|policyRecommendations/);
  });

  it("서버 모듈은 server-only이고 NEXT_PUBLIC_ 변수를 쓰지 않는다", () => {
    const source = read("lib/policyApi/youthPolicy.ts");
    expect(source.startsWith('import "server-only";')).toBe(true);
    // 주석의 안내 문구는 빼고, 실제로 환경변수를 읽는 코드만 본다.
    expect(source).not.toMatch(/env(\.|\[["'])NEXT_PUBLIC_/);
    expect(source).toMatch(/env\.YOUTH_POLICY_API_KEY/);
  });
});
