"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ZodType } from "zod";

/** 로그인·DB 없이 브라우저 탭이 열려 있는 동안만 값을 보관한다. */
export const SESSION_KEYS = {
  profile: "benefit-check.profile",
  messages: "benefit-check.messages",
  diagnosis: "benefit-check.diagnosis",
  checklist: "benefit-check.checklist",
} as const;

const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function parse<T>(raw: string, schema: ZodType<T>): T | null {
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readSession<T>(key: string, schema: ZodType<T>): T | null {
  const raw = readRaw(key);
  return raw === null ? null : parse(raw, schema);
}

export function writeSession(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  if (readRaw(key) === raw) return;
  memory.set(key, raw);
  try {
    window.sessionStorage.setItem(key, raw);
  } catch {
    // 저장소를 쓸 수 없으면 메모리 값만 사용한다.
  }
  emit();
}

export function clearSession(...keys: string[]) {
  keys.forEach((key) => {
    memory.delete(key);
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // 저장소를 쓸 수 없으면 메모리 값만 지운다.
    }
  });
  emit();
}

export function useSessionValue<T>(key: string, schema: ZodType<T>) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => undefined,
  );
  const value = useMemo(() => (raw ? parse(raw, schema) : null), [raw, schema]);
  return { ready: raw !== undefined, value };
}
