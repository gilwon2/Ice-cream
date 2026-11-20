import "server-only";
import { z } from "zod";
import type { Policy } from "@/data/policies";
import { fallbackRecommendations } from "@/data/policyRecommendations";
import { formatDate, koreanDate, type CalendarDate } from "@/lib/rules";
import {
  MAX_RECOMMENDATIONS,
  RECOMMENDATION_API_SOURCE,
  type RecommendationItem,
  type RecommendationResponse,
} from "./recommendationsShared";

/*
 * 온통청년 청년정책 Open API로 "비슷한 청년정책"을 찾는다.
 * - 추천에만 쓴다. 자격 판정은 src/lib/rules/만 하며, 이 모듈은 판정 결과를 바꾸지 않는다.
 * - 요청에는 정책의 분야만 넣는다. 생년월일·소득·가구원 수·거주지 같은 사용자 입력값은 받지도 않는다.
 * - 인증키는 서버 환경변수로만 읽고, 로그에는 가린 주소만 남긴다.
 */

export const YOUTH_POLICY_ENDPOINT = "https://www.youthcenter.go.kr/go/ythip/getPlcy";

/** 온통청년 호출의 시간 제한 */
export const YOUTH_POLICY_TIMEOUT_MS = 5_000;

/** 같은 분야 검색 결과를 서버에서 다시 쓰는 시간 */
export const YOUTH_POLICY_CACHE_MS = 60 * 60 * 1000;

/** 한 번에 받을 목록 수. 승인·마감·같은 정책을 걸러도 4개가 남도록 넉넉히 받는다. */
const PAGE_SIZE = 50;

/** 코드정의서(4절)의 코드 */
export const CODES = {
  approved: "0044002",
  periodSpecific: "0057001",
  periodAlways: "0057002",
  periodClosed: "0057003",
  centralGovernment: "0054001",
  localGovernment: "0054002",
} as const;

/** 요청 주소에 들어갈 수 있는 쿼리 이름. 이 밖의 값은 넣지 않는다(테스트가 검사). */
export const ALLOWED_QUERY_KEYS = [
  "apiKeyNm",
  "pageNum",
  "pageSize",
  "pageType",
  "rtnType",
  "lclsfNm",
  "mclsfNm",
] as const;

type Env = Record<string, string | undefined>;

/** YOUTH_POLICY_API_KEY만 읽는다. NEXT_PUBLIC_ 변수는 쓰지 않는다. */
export function readYouthPolicyKey(env: Env = process.env): string | null {
  const value = env.YOUTH_POLICY_API_KEY?.trim();
  return value ? value : null;
}

/**
 * 요청 주소를 만든다. 인자로 정책의 추천 분류만 받으므로
 * 사용자 입력값이 들어갈 길이 없다. zipCd(거주지)도 쓰지 않는다.
 */
export function buildRequestUrl(category: Policy["recommendation"], apiKey: string): URL {
  const url = new URL(YOUTH_POLICY_ENDPOINT);
  url.searchParams.set("apiKeyNm", apiKey);
  url.searchParams.set("pageNum", "1");
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("pageType", "1");
  url.searchParams.set("rtnType", "json");
  url.searchParams.set("lclsfNm", category.lclsfNm);
  url.searchParams.set("mclsfNm", category.mclsfQuery);
  return url;
}

/** 로그에 남길 주소. apiKeyNm 값을 가린다. */
export function maskUrl(url: URL | string): string {
  const masked = new URL(url.toString());
  if (masked.searchParams.has("apiKeyNm")) masked.searchParams.set("apiKeyNm", "***");
  return masked.toString();
}

/** 오류 메시지 안에 키가 그대로 들어 있어도 가린다. */
function redact(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text
    .split(apiKey)
    .join("***")
    .split(encodeURIComponent(apiKey))
    .join("***");
}

/* ───────────────────────── 응답 검증 ───────────────────────── */

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

/**
 * 카드에 쓰는 필드만 꺼낸다. 연령·소득·자격 조건 같은 필드는 일부러 넣지 않아
 * (z.object는 모르는 키를 버린다) 판정에 쓰일 길을 막는다.
 */
const policyItemSchema = z.object({
  plcyNo: z.string().min(1),
  plcyNm: z.string().min(1),
  /** 정책키워드명(예: "주거지원,보조금"). 순서 정렬에만 쓴다. */
  plcyKywdNm: optionalText,
  plcyAprvSttsCd: optionalText,
  aplyPrdSeCd: optionalText,
  aplyYmd: optionalText,
  plcyExplnCn: optionalText,
  plcySprtCn: optionalText,
  sprvsnInstCdNm: optionalText,
  rgtrHghrkInstCdNm: optionalText,
  pvsnInstGroupCd: optionalText,
  lclsfNm: optionalText,
  mclsfNm: optionalText,
  aplyUrlAddr: optionalText,
  refUrlAddr1: optionalText,
});

export type YouthPolicyItem = z.infer<typeof policyItemSchema>;

/** 2026-11-20 실제 호출로 확인한 구조: { resultCode, resultMessage, result: { pagging, youthPolicyList } } */
const responseSchema = z.object({
  resultCode: z.coerce.number(),
  resultMessage: optionalText,
  result: z
    .object({
      pagging: z
        .object({
          totCount: z.coerce.number(),
          pageNum: z.coerce.number(),
          pageSize: z.coerce.number(),
        })
        .optional(),
      youthPolicyList: z.array(z.unknown()).nullish(),
    })
    .nullish(),
});

export type ParsedResponse =
  | { ok: true; items: YouthPolicyItem[]; totalCount: number | null }
  | { ok: false; reason: "invalid_response" | "api_error" };

/** 응답 본문을 검증한다. 형식이 틀린 항목 하나는 버리고 나머지는 쓴다. */
export function parseYouthPolicyResponse(body: unknown): ParsedResponse {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "invalid_response" };
  if (parsed.data.resultCode !== 200) return { ok: false, reason: "api_error" };
  const list = parsed.data.result?.youthPolicyList ?? [];
  const items: YouthPolicyItem[] = [];
  for (const raw of list) {
    const item = policyItemSchema.safeParse(raw);
    if (item.success) items.push(item.data);
  }
  return {
    ok: true,
    items,
    totalCount: parsed.data.result?.pagging?.totCount ?? null,
  };
}

/* ───────────────────────── 텍스트·링크 정리 ───────────────────────── */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** 요약 최대 길이. 화면은 CSS로 2줄까지만 보여준다. */
export const SUMMARY_MAX_LENGTH = 120;

/** HTML 태그, 엔티티, 머리 기호, 줄바꿈과 연속 공백을 정리한다. */
export function cleanText(value: string, maxLength = SUMMARY_MAX_LENGTH): string {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? " ")
    // 엔티티를 풀며 생긴 태그도 다시 지운다.
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[❍○●■□◦▶▷•◆◇]/g, " ")
    // "ㆍ", "-"는 낱말 안(예: 시설ㆍ장비)에도 쓰여서 줄 머리나 공백 뒤에 올 때만 머리 기호로 보고 지운다.
    .replace(/(^|\s)ㆍ/g, "$1")
    .replace(/(^|\s)[-–]\s/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** 스킴 없이 온 도메인 모양 주소 (예: www.dgyouth.kr, plus.gov.kr/path) */
const BARE_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?([/?#]\S*)?$/i;

/**
 * http/https 링크만 통과시킨다. 스킴 없는 도메인 모양이면 https://를 붙인 뒤 다시 검사한다.
 * javascript:, data:, //로 시작하는 주소, 공백이 섞인 값, 계정 정보가 든 주소는 버린다.
 */
export function safeUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw || /[\s\u0000-\u001f\u007f\\]/.test(raw) || raw.startsWith("//")) return null;

  let candidate: string;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !BARE_DOMAIN.test(raw)) {
    candidate = raw;
  } else if (BARE_DOMAIN.test(raw)) {
    candidate = `https://${raw}`;
  } else {
    return null;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  return url.href;
}

/* ───────────────────────── 고르기 ───────────────────────── */

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "");
}

function todayDigits(now: Date): string {
  const today = koreanDate(now);
  return `${today.year}${String(today.month).padStart(2, "0")}${String(today.day).padStart(2, "0")}`;
}

function digitsToDate(value: string): CalendarDate {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(4, 6)),
    day: Number(value.slice(6, 8)),
  };
}

/** "YYYYMMDD ~ YYYYMMDD" 구간들. 형식이 다르면 빈 배열이다. */
function applicationRanges(aplyYmd: string): { start: string; end: string }[] {
  return [...aplyYmd.matchAll(/(\d{8})\s*~\s*(\d{8})/g)].map((match) => ({
    start: match[1],
    end: match[2],
  }));
}

/** 신청 구간이 있고, 모든 구간의 종료일이 오늘(한국 시간)보다 앞이면 지난 것으로 본다. */
function isExpired(item: YouthPolicyItem, today: string): boolean {
  const ranges = applicationRanges(item.aplyYmd);
  return ranges.length > 0 && ranges.every((range) => range.end < today);
}

/** 신청기간 표시 문구. 날짜가 있으면 날짜를, 없으면 신청기간구분 코드의 뜻을 쓴다. */
export function describePeriod(item: Pick<YouthPolicyItem, "aplyYmd" | "aplyPrdSeCd">): string {
  const ranges = applicationRanges(item.aplyYmd);
  if (ranges.length > 0) {
    const first = ranges[0];
    const text = `${formatDate(digitsToDate(first.start))} ~ ${formatDate(digitsToDate(first.end))}`;
    return ranges.length > 1 ? `${text} 외` : text;
  }
  switch (item.aplyPrdSeCd) {
    case CODES.periodAlways:
      return "상시";
    case CODES.periodSpecific:
      return "특정 기간 (공고에서 확인해요)";
    default:
      return "공고에서 확인해요";
  }
}

const NOT_A_REGION = new Set(["정부산하기관및위원회"]);

function toItem(item: YouthPolicyItem): RecommendationItem {
  const agency = cleanText(item.sprvsnInstCdNm, 60);
  const upper = cleanText(item.rgtrHghrkInstCdNm, 30);
  // 지자체 정책은 기관명이 "농정전략과"처럼 부서명만 올 때가 있어 시·도를 따로 보여준다.
  const region =
    item.pvsnInstGroupCd === CODES.localGovernment &&
    upper &&
    !NOT_A_REGION.has(upper) &&
    !agency.includes(upper)
      ? upper
      : undefined;
  const summary = cleanText(item.plcySprtCn) || cleanText(item.plcyExplnCn);
  return {
    id: item.plcyNo,
    title: cleanText(item.plcyNm, 80),
    agency: agency || region || "공고에서 확인해요",
    ...(region && agency ? { region } : {}),
    summary,
    period: describePeriod(item),
    url: safeUrl(item.aplyUrlAddr) ?? safeUrl(item.refUrlAddr1),
    sourceName: RECOMMENDATION_API_SOURCE,
  };
}

/**
 * 정책명이나 키워드에 분야 관련 낱말이 있으면 true.
 * 중분류명은 요청 단계에서 이미 거른 값이라 모든 결과가 같으므로 비교하지 않는다
 * (넣으면 모든 항목이 관련 있음이 되어 순서가 바뀌지 않는다).
 */
export function isRelevant(
  item: Pick<YouthPolicyItem, "plcyNm" | "plcyKywdNm">,
  category: Pick<Policy["recommendation"], "relevanceKeywords">,
): boolean {
  const text = normalizeName(`${item.plcyNm} ${item.plcyKywdNm}`);
  return category.relevanceKeywords.some((word) => text.includes(normalizeName(word)));
}

/**
 * 받은 목록에서 보여줄 정책을 고른다.
 * 승인된 정책만, 마감(코드 또는 지난 종료일)과 지금 진단 중인 정책은 빼고 최대 4개.
 * 분야 관련 낱말이 있는 정책 → 링크가 있는 정책 → 중앙부처 → 상시 접수 순으로 앞에 둔다
 * (같으면 받은 순서). 관련 낱말이 없어도 빼지는 않는다.
 */
export function selectRecommendations(
  items: readonly YouthPolicyItem[],
  category: Policy["recommendation"],
  now: Date,
): RecommendationItem[] {
  const today = todayDigits(now);
  const sameNames = category.samePolicyNames.map(normalizeName);
  const seen = new Set<string>();

  const picked = items.filter((item) => {
    if (item.plcyAprvSttsCd !== CODES.approved) return false;
    if (item.aplyPrdSeCd === CODES.periodClosed) return false;
    if (isExpired(item, today)) return false;
    // 서버가 중분류를 부분 검색어로 찾으므로 공식 분류명으로 다시 거른다.
    if (!item.lclsfNm.includes(category.lclsfNm) || !item.mclsfNm.includes(category.mclsfNm)) {
      return false;
    }
    const name = normalizeName(item.plcyNm);
    if (sameNames.some((same) => name.startsWith(same))) return false;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  return picked
    .map((item, index) => ({ item, card: toItem(item), index }))
    .filter(({ card }) => card.title.length > 0)
    .sort((a, b) => {
      const score = (entry: typeof a) =>
        (isRelevant(entry.item, category) ? 0 : 8) +
        (entry.card.url ? 0 : 4) +
        (entry.item.pvsnInstGroupCd === CODES.centralGovernment ? 0 : 2) +
        (entry.item.aplyPrdSeCd === CODES.periodAlways ? 0 : 1);
      return score(a) - score(b) || a.index - b.index;
    })
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ card }) => card);
}

/* ───────────────────────── 호출·캐시·대체 ───────────────────────── */

export type YouthPolicyFailure =
  | "missing_key"
  | "timeout"
  | "http_error"
  | "api_error"
  | "invalid_response"
  | "network_error"
  | "empty";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type GetRecommendationsOptions = {
  env?: Env;
  fetch?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
  /** 실패 사유 기록. 기본은 console.warn이며 가린 주소만 남긴다. */
  log?: (message: string) => void;
};

type CacheEntry = { expiresAt: number; value: RecommendationResponse };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RecommendationResponse>>();

/** 테스트용. 서버 메모리 캐시를 비운다. */
export function clearRecommendationCache(): void {
  cache.clear();
  inFlight.clear();
}

function cacheKey(category: Policy["recommendation"]): string {
  return [
    category.lclsfNm,
    category.mclsfQuery,
    category.mclsfNm,
    category.samePolicyNames.join(","),
    category.relevanceKeywords.join(","),
  ].join("|");
}

type FetchOutcome =
  | { ok: true; items: RecommendationItem[] }
  | { ok: false; reason: YouthPolicyFailure; detail?: string };

async function fetchFromApi(
  policy: Policy,
  apiKey: string,
  options: Required<Pick<GetRecommendationsOptions, "fetch" | "now" | "timeoutMs">>,
): Promise<FetchOutcome & { url: URL }> {
  const url = buildRequestUrl(policy.recommendation, apiKey);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, options.timeoutMs);
  });

  try {
    const request = (async (): Promise<FetchOutcome> => {
      const response = await options.fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        // 캐시는 이 모듈이 직접 한다.
        cache: "no-store",
      });
      if (!response.ok) return { ok: false, reason: "http_error", detail: `HTTP ${response.status}` };
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, reason: "invalid_response" };
      }
      const parsed = parseYouthPolicyResponse(body);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      const items = selectRecommendations(parsed.items, policy.recommendation, options.now());
      if (items.length === 0) return { ok: false, reason: "empty" };
      return { ok: true, items };
    })();
    // 시간 초과로 먼저 끝나면 늦게 실패한 요청이 처리되지 않은 예외로 남지 않게 한다.
    request.catch(() => {});

    const outcome = await Promise.race([request, timedOut]);
    if (outcome === "timeout") return { ok: false, reason: "timeout", url };
    return { ...outcome, url };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: "timeout", url };
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "network_error", detail: `${name}: ${redact(message, apiKey)}`, url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 정책 하나의 "비슷한 청년정책"을 돌려준다. 어떤 실패에도 예외를 던지지 않고
 * 미리 정리한 대체 목록(source: "fallback")을 준다. 성공한 결과만 1시간 캐시한다
 * (잠깐의 오류가 1시간 동안 대체 목록으로 굳지 않게).
 */
export async function getRecommendations(
  policy: Policy,
  options: GetRecommendationsOptions = {},
): Promise<RecommendationResponse> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message: string) => console.warn(message));
  const fallback = (): RecommendationResponse => ({
    source: "fallback",
    fetchedAt: now().toISOString(),
    items: fallbackRecommendations(policy).slice(0, MAX_RECOMMENDATIONS),
  });

  const apiKey = readYouthPolicyKey(options.env);
  if (!apiKey) {
    log("[youth-policy] missing_key: YOUTH_POLICY_API_KEY가 없어 대체 목록을 보여줘요.");
    return fallback();
  }

  const key = cacheKey(policy.recommendation);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now().getTime()) return cached.value;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const outcome = await fetchFromApi(policy, apiKey, {
      fetch: options.fetch ?? fetch,
      now,
      timeoutMs: options.timeoutMs ?? YOUTH_POLICY_TIMEOUT_MS,
    });
    if (!outcome.ok) {
      const detail = outcome.detail ? ` (${outcome.detail})` : "";
      log(`[youth-policy] ${outcome.reason}${detail}: ${maskUrl(outcome.url)}`);
      return fallback();
    }
    const fetchedAt = now();
    const value: RecommendationResponse = {
      source: "api",
      fetchedAt: fetchedAt.toISOString(),
      items: outcome.items,
    };
    cache.set(key, { expiresAt: fetchedAt.getTime() + YOUTH_POLICY_CACHE_MS, value });
    return value;
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } catch {
    // 위에서 모든 실패를 처리하지만, 만일을 위해 대체 목록으로 끝낸다.
    return fallback();
  } finally {
    inFlight.delete(key);
  }
}
