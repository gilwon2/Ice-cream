import type { MedianIncomeTable } from "@/lib/rules";

/** 2026년 기준 중위소득 (보건복지부 고시, 월 금액, 원) */
export const MEDIAN_INCOME_2026: MedianIncomeTable = {
  year: 2026,
  byHouseholdSize: {
    1: 2_564_238,
    2: 4_199_292,
    3: 5_359_036,
    4: 6_494_738,
    5: 7_556_719,
    6: 8_555_952,
    7: 9_515_150,
  },
  source: {
    name: "보건복지부 · 기준 중위소득",
    url: "https://www.mohw.go.kr/menu.es?mid=a10708010900",
    publishedAt: "2025-09-30",
  },
};
