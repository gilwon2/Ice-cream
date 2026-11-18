import { z } from "zod";

export const REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

export const EMPLOYMENT_LABELS = {
  unemployed: "구직 중·미취업",
  employed: "직장인",
  self_employed: "자영업·프리랜서",
  student: "재학생",
} as const;

export const HOUSING_LABELS = {
  monthly_rent: "월세",
  jeonse: "전세",
  with_parents: "부모님과 거주",
  owned: "본인 소유 주택",
} as const;

export const TRI_STATE_LABELS = {
  yes: "예",
  no: "아니요",
  unknown: "잘 모르겠어요",
} as const;

const employmentValues = ["unemployed", "employed", "self_employed", "student"] as const;
const housingValues = ["monthly_rent", "jeonse", "with_parents", "owned"] as const;
const triStateValues = ["yes", "no", "unknown"] as const;

export const profileSchema = z.object({
  age: z.number().int().min(15).max(45),
  region: z.enum(REGIONS),
  /** 현재 시·도에 연속으로 거주한 개월 수 */
  residencyMonths: z.number().int().min(0).max(600),
  employment: z.enum(employmentValues),
  householdSize: z.number().int().min(1).max(6),
  /** 가구 전체 월 소득(만 원). 모르면 null */
  householdMonthlyIncome: z.number().min(0).max(100000).nullable(),
  /** 본인 연 소득(만 원). 모르면 null */
  personalAnnualIncome: z.number().min(0).max(1000000).nullable(),
  housing: z.enum(housingValues),
  /** 월세(만 원) */
  monthlyRent: z.number().min(0).max(1000),
  /** 보증금(만 원) */
  deposit: z.number().min(0).max(1000000),
  independentHousehold: z.enum(triStateValues),
  residentRegistered: z.enum(triStateValues),
  receivingPolicyIds: z.array(z.string().max(64)).max(6),
});

export type Profile = z.infer<typeof profileSchema>;
export type Employment = Profile["employment"];
export type Housing = Profile["housing"];
