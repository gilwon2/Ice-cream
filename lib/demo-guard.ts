import { createHash, timingSafeEqual } from "node:crypto";

function normalizeCode(code: string) {
  return code.trim().normalize("NFC");
}

function decodeHeaderCode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAccessCodeRequired(expected = process.env.DEMO_ACCESS_CODE) {
  return Boolean(expected?.trim());
}

/** 코드가 설정되지 않은 환경에서는 항상 통과시킨다. */
export function hasValidAccessCode(expected: string | undefined, headerValue: string | null) {
  if (!isAccessCodeRequired(expected)) return true;
  if (!headerValue) return false;
  // 길이와 내용이 응답 시간으로 드러나지 않도록 해시를 고정 시간에 비교한다.
  return timingSafeEqual(
    digest(normalizeCode(expected ?? "")),
    digest(normalizeCode(decodeHeaderCode(headerValue))),
  );
}

/** 프록시가 마지막에 덧붙인 주소가 클라이언트가 조작하기 가장 어렵다. */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  maxKeys?: number;
};

/** 서버 프로세스 메모리에 저장하는 고정 윈도우 제한기. */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: RateLimiterOptions) {
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

  return (key: string, now = Date.now()) => {
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
