import type { ChoiceOption } from "@/lib/rules";

/** 공고 내용을 이 프로젝트에서 마지막으로 확인한 날 */
export const INFO_CHECKED_AT = "2026-11-19";

export const YES_NO: readonly ChoiceOption[] = [
  { value: "yes", label: "예" },
  { value: "no", label: "아니오" },
];

export const FAMILY_CERTIFICATE_ISSUER = {
  name: "전자가족관계등록시스템",
  url: "https://efamily.scourt.go.kr",
};

export const INQUIRY_TOPICS = [
  "가구 구성 및 세대 기준",
  "소득 산정방식",
  "재산 산정방식",
  "그 밖의 자격조건",
];
