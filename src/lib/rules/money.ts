const WON_PER_MANWON = 10000;

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** 만 원 단위 입력을 원 단위 정수로 바꾼다. 유효하지 않으면 null을 돌려준다. */
export function manwonToWon(value: string): number | null {
  const amount = parseAmount(value);
  if (amount === null) return null;
  const won = Math.round(amount * WON_PER_MANWON);
  return Number.isSafeInteger(won) ? won : null;
}

/** 원 단위 정수를 소수 오차 없는 만 원 단위 문자열로 바꾼다. */
export function formatManwon(won: number): string {
  const manwon = Math.trunc(won / WON_PER_MANWON);
  const rest = won % WON_PER_MANWON;
  if (rest === 0) return String(manwon);
  const decimals = String(rest).padStart(4, "0").replace(/0+$/, "");
  return `${manwon}.${decimals}`;
}

function withCommas(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const WON_PER_EOK = 100_000_000;

/** 원 단위 정수를 "1억 2,200만 원", "153만 8,543원"처럼 읽기 쉬운 문자열로 바꾼다. */
export function formatWon(won: number): string {
  const eok = Math.trunc(won / WON_PER_EOK);
  const manwon = Math.trunc((won % WON_PER_EOK) / WON_PER_MANWON);
  const rest = won % WON_PER_MANWON;

  const parts: string[] = [];
  if (eok > 0) parts.push(`${withCommas(eok)}억`);
  if (manwon > 0) parts.push(`${withCommas(manwon)}만`);
  if (rest > 0 || parts.length === 0) return [...parts, `${withCommas(rest)}원`].join(" ");
  return `${parts.join(" ")} 원`;
}

/** 0 이상의 정수 문자열만 숫자로 바꾼다. */
export function parseCount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
