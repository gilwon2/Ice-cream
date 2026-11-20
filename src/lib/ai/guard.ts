import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { readAiConfig } from "./config";
import {
  ACCESS_CODE_HEADER,
  AI_GUARD_MESSAGES,
  decodeAccessCode,
  type AiErrorBody,
  type AiGuardErrorCode,
} from "./shared";

/** 요청 본문 최대 크기(바이트). 조건 값만 받으므로 넉넉하다. */
const MAX_BODY_BYTES = 16_000;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };
export type RateLimiter = (key: string, now?: number) => RateLimitResult;

type RateLimiterOptions = { limit: number; windowMs: number; maxKeys?: number };

/**
 * 서버 프로세스 메모리에 저장하는 고정 윈도우 제한기.
 * 서버 인스턴스가 여러 개면 인스턴스마다 따로 센다.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  function makeRoom(now: number) {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
    if (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest !== undefined) windows.delete(oldest);
    }
  }

  return (key, now = Date.now()) => {
    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
      windows.delete(key);
      if (windows.size >= maxKeys) makeRoom(now);
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
    }
    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

/** 프록시가 마지막에 덧붙인 주소가 클라이언트가 조작하기 가장 어렵다. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

function digest(value: string) {
  return createHash("sha256").update(value.trim().normalize("NFC")).digest();
}

/** 길이와 내용이 응답 시간으로 드러나지 않도록 해시를 고정 시간에 비교한다. */
export function hasValidAccessCode(expected: string, headerValue: string | null): boolean {
  if (!headerValue) return false;
  return timingSafeEqual(digest(expected), digest(decodeAccessCode(headerValue)));
}

function errorResponse(
  code: AiGuardErrorCode,
  status: number,
  headers: Record<string, string> = {},
): Response {
  const body: AiErrorBody = { error: { code, message: AI_GUARD_MESSAGES[code] } };
  return Response.json(body, { status, headers });
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return { ok: false };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export type GuardOptions = {
  limiter: RateLimiter;
  /** 서버에 설정된 DEMO_ACCESS_CODE. 없으면 AI 라우트를 열지 않는다(503). */
  accessCode: string | null;
  now?: number;
};

export type GuardResult<T> = { ok: true; body: T } | { ok: false; response: Response };

/**
 * API 라우트 공통 보호.
 * ① IP별 호출 제한(429) → ② 접근 코드(401) → ③ 본문 Zod 검증(400) 순서로 검사한다.
 * 코드 대입 시도도 함께 막도록 호출 제한을 가장 먼저 센다.
 */
export async function guardRequest<S extends z.ZodType>(
  request: Request,
  schema: S,
  { limiter, accessCode, now }: GuardOptions,
): Promise<GuardResult<z.infer<S>>> {
  const limit = limiter(clientIp(request.headers), now);
  if (!limit.allowed) {
    return {
      ok: false,
      response: errorResponse("rate_limited", 429, { "Retry-After": String(limit.retryAfterSeconds) }),
    };
  }

  if (!accessCode) return { ok: false, response: errorResponse("not_configured", 503) };
  if (!hasValidAccessCode(accessCode, request.headers.get(ACCESS_CODE_HEADER))) {
    return { ok: false, response: errorResponse("invalid_access_code", 401) };
  }

  const json = await readJson(request);
  const parsed = json.ok ? schema.safeParse(json.value) : null;
  if (!parsed?.success) return { ok: false, response: errorResponse("invalid_request", 400) };
  return { ok: true, body: parsed.data };
}

/**
 * 모든 AI 라우트가 함께 쓰는 제한기: IP별 1분 AI_RATE_LIMIT_PER_MINUTE회(기본 30회).
 * 서버가 시작될 때 한 번 읽으므로, 값을 바꾸면 서버를 다시 시작해야 한다.
 */
export const aiRateLimiter = createRateLimiter({
  limit: readAiConfig().rateLimitPerMinute,
  windowMs: 60_000,
});

/** 라우트에서 쓰는 기본 보호. 환경변수의 접근 코드와 공용 제한기를 쓴다. */
export function guardAiRoute<S extends z.ZodType>(request: Request, schema: S) {
  return guardRequest(request, schema, {
    limiter: aiRateLimiter,
    accessCode: readAiConfig().accessCode,
  });
}
