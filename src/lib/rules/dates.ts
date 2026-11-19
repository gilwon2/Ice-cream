export type CalendarDate = { year: number; month: number; day: number };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간(UTC+9, 일광절약시간 없음) 기준의 날짜를 돌려준다. */
export function koreanDate(now: Date): CalendarDate {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function compare(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** "YYYY-MM-DD"를 달력 날짜로 바꾼다. 존재하지 않는 날짜는 null이다. */
export function parseDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** 생년월일 입력이 오늘 이전의 실제 날짜일 때만 돌려준다. */
export function parseBirthDate(value: string, now: Date): CalendarDate | null {
  const birth = parseDate(value);
  if (!birth || birth.year < 1900) return null;
  return compare(birth, koreanDate(now)) > 0 ? null : birth;
}

/** 오늘까지 꽉 채운 개월 수 */
export function monthsOld(birth: CalendarDate, today: CalendarDate): number {
  const months = (today.year - birth.year) * 12 + (today.month - birth.month);
  return today.day < birth.day ? months - 1 : months;
}

/** 만 나이 */
export function ageOn(birth: CalendarDate, today: CalendarDate): number {
  return Math.floor(monthsOld(birth, today) / 12);
}

export function formatDate(date: CalendarDate): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.year}.${pad(date.month)}.${pad(date.day)}`;
}

/** ISO 시각을 한국 시간 "YYYY.MM.DD HH:mm"으로 바꾼다. */
export function formatKoreanDateTime(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}.${pad(shifted.getUTCMonth() + 1)}.${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** "YYYY-MM-DD"를 "YYYY.MM.DD"로 바꾼다. 형식이 다르면 그대로 둔다. */
export function formatIsoDate(value: string): string {
  const date = parseDate(value);
  return date ? formatDate(date) : value;
}

/** 오늘 기준으로 정확히 만 age세가 되는 생년월일 (2월 29일은 28일로 맞춘다) */
export function birthDateForAge(age: number, now: Date): string {
  const today = koreanDate(now);
  const year = today.year - age;
  let day = today.day;
  while (!parseDate(toIso({ year, month: today.month, day }))) day -= 1;
  return toIso({ year, month: today.month, day });
}

export function toIso(date: CalendarDate): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/* ───────── 생년월일 입력 ───────── */

export const INVALID_BIRTH_DATE_MESSAGE = "올바른 생년월일을 입력해 주세요.";

/** 선택 입력에서 보여줄 가장 이른 출생연도 */
export const BIRTH_YEAR_MIN = 1960;

/** 청년정책의 가장 낮은 대상 연령. 선택 목록은 이 나이의 출생연도부터 내려간다. */
const YOUNGEST_TARGET_AGE = 15;

/**
 * 입력한 문자에서 숫자만 최대 8자리 남기고 "YYYY-MM-DD" 모양으로 끊어 보여준다.
 * 예: "1999031" → "1999-03-1", "19990315" → "1999-03-15"
 */
export function formatDateDigits(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export type BirthDateStatus =
  | { kind: "empty" }
  | { kind: "incomplete" }
  | { kind: "invalid" }
  | { kind: "valid"; iso: string; age: number; year: number };

/** 생년월일 입력 상태. 8자리를 다 입력했는데 없는 날짜이거나 미래면 invalid다. */
export function describeBirthDate(value: string, now: Date): BirthDateStatus {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return { kind: "empty" };
  if (digits.length < 8) return { kind: "incomplete" };

  const iso = formatDateDigits(digits);
  const birth = parseBirthDate(iso, now);
  if (!birth) return { kind: "invalid" };
  return { kind: "valid", iso, age: ageOn(birth, koreanDate(now)), year: birth.year };
}

/** 그 달의 일수. 연도를 모르면 2월은 29일까지 고를 수 있게 한다. */
export function daysInMonth(year: number | null, month: number): number {
  if (month === 2 && year === null) return 29;
  return new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate();
}

export type BirthYearGroup = { label: string; years: number[] };

/**
 * 출생연도 선택 목록. 대상 연령이 많은 2000년 전후가 먼저 보이도록
 * (올해 - 15)년부터 1960년까지 내림차순으로 두고, 그 뒤의 연도는 따로 묶는다.
 */
export function birthYearGroups(now: Date): BirthYearGroup[] {
  const thisYear = koreanDate(now).year;
  const pivot = Math.max(BIRTH_YEAR_MIN, thisYear - YOUNGEST_TARGET_AGE);
  const descending: number[] = [];
  for (let year = pivot; year >= BIRTH_YEAR_MIN; year -= 1) descending.push(year);
  const later: number[] = [];
  for (let year = pivot + 1; year <= thisYear; year += 1) later.push(year);

  return [
    { label: `${pivot}년 ~ ${BIRTH_YEAR_MIN}년`, years: descending },
    ...(later.length > 0 ? [{ label: `${pivot + 1}년 이후`, years: later }] : []),
  ];
}

export type DateParts = { year: string; month: string; day: string };

/** 입력값("1999-03-15" 또는 입력 중인 "1999-03")을 선택 입력의 연·월·일로 나눈다. */
export function splitDateText(value: string, now: Date): DateParts {
  const digits = value.replace(/\D/g, "");
  const thisYear = koreanDate(now).year;
  const year = digits.length >= 4 ? Number(digits.slice(0, 4)) : NaN;
  const month = digits.length >= 6 ? Number(digits.slice(4, 6)) : NaN;
  const day = digits.length >= 8 ? Number(digits.slice(6, 8)) : NaN;

  const validYear = year >= BIRTH_YEAR_MIN && year <= thisYear;
  const validMonth = month >= 1 && month <= 12;
  const validDay =
    validMonth && day >= 1 && day <= daysInMonth(validYear ? year : null, month);

  return {
    year: validYear ? String(year) : "",
    month: validMonth ? String(month) : "",
    day: validDay ? String(day) : "",
  };
}

/** 연·월·일을 모두 골랐을 때만 "YYYY-MM-DD"를 만들고, 아니면 빈 문자열이다. */
export function composeDate(parts: DateParts): string {
  if (!parts.year || !parts.month || !parts.day) return "";
  return toIso({ year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) });
}
