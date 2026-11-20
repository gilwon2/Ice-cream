import type { AnswerOutcome, Question, Rule, Source } from "@/lib/rules";
import { MEDIAN_INCOME_2026 } from "../medianIncome";
import { INFO_CHECKED_AT, YES_NO } from "./common";
import type { Policy } from "./types";

/** 고용24 취업지원신청 소개. 요건과 참여 제한 대상의 원문이다. */
const WORK24_INTRO: Source = {
  name: "고용24 · 국민취업지원제도 취업지원신청 소개",
  url: "https://www.work24.go.kr/ua/z/z/1300/selectEmssRqutIntro.do",
};

/** 고용24 제도안내 (최종 수정 2025-12-30) */
const WORK24_SYSTEM: Source = {
  name: "고용24 · 국민취업지원제도 제도안내",
  url: "https://m.work24.go.kr/cm/c/f/1100/selecSystInfo.do?systId=SI00000316&systClId=SC00000206",
  publishedAt: "2025-12-30",
};

const ONE_PERSON_60_PERCENT = 1_538_543;

function yesBlocks(reason: string): Record<string, AnswerOutcome> {
  return {
    no: { status: "MET", reason: "참여 제한 대상이 아닌 것으로 보여요." },
    yes: { status: "NOT_MET", reason },
  };
}

const questions: Question[] = [
  {
    id: "birthDate",
    kind: "date",
    label: "생년월일",
    help: "만 나이를 계산하는 데만 쓰고 저장하지 않아요.",
  },
  {
    id: "militaryMonths",
    kind: "number",
    label: "병역의무를 이행한 기간",
    help: "군 복무 등 병역의무 이행 기간만큼 연령 기준이 늘어나요(최대 만 37세). 없으면 0을 입력하세요.",
    unit: "개월",
    integer: true,
    placeholder: "예: 18",
    allowUnknown: true,
    appliesWhen: { birthDateQuestion: "birthDate", ageAtLeast: 35 },
  },
  {
    id: "householdSize",
    kind: "number",
    label: "가구원 수",
    help: "주민등록등본에 함께 올라 있는 부모님·자녀와 본인을 합한 수예요. 생계와 주거를 같이하는 가족도 포함될 수 있어요.",
    unit: "명",
    integer: true,
    placeholder: "예: 3",
  },
  {
    id: "householdIncome",
    kind: "number",
    label: "가구 월소득 합계",
    help: "가구원의 근로·사업·재산소득과 공적연금을 합한 월평균 금액이에요.",
    unit: "만 원",
    placeholder: "예: 400",
    allowUnknown: true,
  },
  {
    id: "householdAsset",
    kind: "number",
    label: "가구 재산 합계",
    help: "가구원의 토지·건물·주택·임차보증금·자동차 등을 합한 금액이에요.",
    unit: "만 원",
    placeholder: "예: 20000",
    allowUnknown: true,
  },
  {
    id: "ownIncome",
    kind: "number",
    label: "본인 월소득",
    help: "아르바이트 등으로 지금 버는 본인의 월평균 소득이에요. 없으면 0을 입력하세요.",
    unit: "만 원",
    placeholder: "예: 0",
    allowUnknown: true,
  },
  {
    id: "workType",
    kind: "choice",
    label: "지금 일하고 있나요?",
    options: [
      { value: "none", label: "일하지 않음" },
      { value: "wage", label: "직장·아르바이트" },
      { value: "business", label: "사업자등록" },
      { value: "freelance", label: "프리랜서·노무제공" },
    ],
  },
  {
    id: "weeklyHours",
    kind: "choice",
    label: "일주일에 몇 시간 일하나요?",
    options: [
      { value: "under30", label: "주 30시간 미만" },
      { value: "over30", label: "주 30시간 이상" },
    ],
    allowUnknown: true,
    appliesWhen: { question: "workType", in: ["wage"] },
  },
  {
    id: "businessIncome",
    kind: "choice",
    label: "사업이나 프리랜서 일로 버는 월소득은 얼마인가요?",
    options: [
      { value: "under250", label: "월 250만 원 미만" },
      { value: "over250", label: "월 250만 원 이상" },
    ],
    allowUnknown: true,
    appliesWhen: { question: "workType", in: ["business", "freelance"] },
  },
  {
    id: "workExperience",
    kind: "choice",
    label: "최근 2년 안에 일한 기간이 100일 또는 800시간 이상인가요?",
    help: "고용보험 가입 기간, 사업자등록 기간, 프리랜서 활동 기간 등을 합쳐요.",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "livelihoodBenefit",
    kind: "choice",
    label: "기초생활보장 생계급여를 받고 있나요?",
    help: "주거급여만 받는다면 '아니오'를 선택하세요.",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "unemploymentBenefit",
    kind: "choice",
    label: "실업급여(구직급여)나 다른 구직활동 수당을 받고 있거나, 끝난 지 6개월이 지나지 않았나요?",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "publicJob",
    kind: "choice",
    label: "정부·지자체 재정지원 일자리에 참여 중이거나, 끝난 지 6개월이 지나지 않았나요?",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "schooling",
    kind: "choice",
    label: "상급학교 진학이나 전문자격증 취득을 위해 학교나 학원에 다니고 있나요?",
    options: YES_NO,
    allowUnknown: true,
  },
];

const rules: Rule[] = [
  {
    id: "nes-age",
    label: "연령",
    criterion: "만 15~34세 (병역 기간을 더하면 최대 만 37세)",
    plainText: "청년특례는 만 15세부터 34세까지예요. 군 복무를 했다면 그 기간만큼 늘어나 최대 만 37세까지 가능해요.",
    howToCheck: ["신분증의 생년월일로 만 나이를 확인하세요.", "병역 기간은 병적증명서로 확인할 수 있어요."],
    verified: true,
    source: WORK24_INTRO,
    check: {
      type: "ageWindow",
      question: "birthDate",
      minAge: 15,
      maxAge: 34,
      extension: { question: "militaryMonths", capAge: 37 },
    },
  },
  {
    id: "nes-household-income",
    label: "가구 소득",
    criterion: "가구 기준 중위소득 120% 이하",
    plainText: "가구원 모두의 월소득 합계가 기준 중위소득의 120% 이하여야 해요.",
    howToCheck: [
      "가구원의 급여명세서나 소득금액증명으로 월평균 소득을 더해 보세요.",
      "신청하면 고용센터가 공적자료로 다시 조회해요.",
    ],
    verified: true,
    source: WORK24_INTRO,
    check: {
      type: "medianIncomeRatio",
      question: "householdIncome",
      householdSizeQuestion: "householdSize",
      percent: 120,
      table: MEDIAN_INCOME_2026,
      cautionAbovePercent: 60,
      caution: "다만 중위소득 60%를 넘으면 예산 상황에 따라 선발되지 않을 수 있어요.",
    },
  },
  {
    id: "nes-household-asset",
    label: "가구 재산",
    criterion: "가구원 합산 재산 5억 원 이하",
    plainText: "가구원이 가진 재산을 모두 합해 5억 원 이하여야 해요.",
    howToCheck: [
      "토지, 건물, 주택, 임차보증금, 자동차 등을 더해 보세요.",
      "재산으로 인정하는 항목과 공제 기준은 고용센터에서 확인할 수 있어요.",
    ],
    verified: true,
    source: WORK24_INTRO,
    check: { type: "maxAmount", question: "householdAsset", maxWon: 500_000_000 },
  },
  {
    id: "nes-own-income",
    label: "본인 소득",
    criterion: "본인 월평균 소득 153만 8,543원 이하 (1인 가구 기준 중위소득 60%)",
    plainText:
      "고용24 안내에는 본인 월평균 소득이 1인 가구 기준 중위소득 60%를 넘으면 참여할 수 없다고 나와요. 청년특례에도 적용되는지는 아직 확인하지 못했어요.",
    howToCheck: ["최근 급여명세서로 본인 월평균 소득을 확인하세요.", "청년특례 적용 여부는 고용센터(1350)에 확인하세요."],
    verified: false,
    source: WORK24_INTRO,
    check: { type: "maxAmount", question: "ownIncome", maxWon: ONE_PERSON_60_PERCENT },
  },
  {
    id: "nes-weekly-hours",
    label: "근로 시간",
    criterion: "임금근로자는 주 30시간 미만",
    plainText: "직장이나 아르바이트를 하고 있다면 일주일에 30시간 미만으로 일할 때만 참여할 수 있어요.",
    howToCheck: ["근로계약서의 주 소정근로시간을 확인하세요."],
    verified: true,
    source: WORK24_INTRO,
    appliesWhen: { question: "workType", in: ["wage"] },
    notApplicableReason: "직장이나 아르바이트를 하지 않으면 해당하지 않아요.",
    check: {
      type: "answer",
      question: "weeklyHours",
      outcomes: {
        under30: { status: "MET", reason: "주 30시간 미만이라 참여할 수 있는 것으로 보여요." },
        over30: {
          status: "NOT_MET",
          reason: "주 30시간 이상 일하면 참여할 수 없는 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "nes-business-income",
    label: "사업·프리랜서 소득",
    criterion: "사업자·프리랜서는 월 소득 250만 원 미만",
    plainText: "사업자등록을 했거나 프리랜서로 일한다면 월 소득이 250만 원 미만일 때만 참여할 수 있어요.",
    howToCheck: ["최근 몇 달의 매출이나 용역 대금에서 월평균 소득을 확인하세요."],
    verified: true,
    source: WORK24_INTRO,
    appliesWhen: { question: "workType", in: ["business", "freelance"] },
    notApplicableReason: "사업이나 프리랜서 일을 하지 않으면 해당하지 않아요.",
    check: {
      type: "answer",
      question: "businessIncome",
      outcomes: {
        under250: { status: "MET", reason: "월 250만 원 미만이라 참여할 수 있는 것으로 보여요." },
        over250: {
          status: "NOT_MET",
          reason: "월 250만 원 이상 벌면 참여할 수 없는 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "nes-livelihood",
    label: "생계급여 수급 아님",
    criterion: "생계급여 수급자는 참여 제한",
    plainText: "기초생활보장 생계급여를 받는 사람은 참여할 수 없어요. 주거급여만 받으면 괜찮아요.",
    howToCheck: ["복지로나 주민센터에서 받고 있는 급여 종류를 확인하세요."],
    verified: true,
    source: WORK24_SYSTEM,
    check: {
      type: "answer",
      question: "livelihoodBenefit",
      outcomes: yesBlocks("생계급여를 받으면 참여할 수 없는 것으로 보여요."),
    },
  },
  {
    id: "nes-unemployment",
    label: "실업급여 수급 아님",
    criterion: "구직급여 등 수급 중이거나 종료 후 6개월 미경과 시 참여 제한",
    plainText: "실업급여나 다른 구직활동 수당을 받는 중이거나, 끝난 지 6개월이 안 됐으면 참여할 수 없어요.",
    howToCheck: ["고용24의 실업급여 메뉴에서 수급 기간을 확인하세요."],
    verified: true,
    source: WORK24_INTRO,
    check: {
      type: "answer",
      question: "unemploymentBenefit",
      outcomes: yesBlocks("수급 중이거나 끝난 지 6개월이 안 됐으면 참여할 수 없는 것으로 보여요."),
    },
  },
  {
    id: "nes-public-job",
    label: "재정지원 일자리 참여 아님",
    criterion: "재정지원 일자리 참여 중이거나 종료 후 6개월 미경과 시 참여 제한",
    plainText: "정부나 지자체 예산으로 만든 일자리에 참여 중이거나, 끝난 지 6개월이 안 됐으면 참여할 수 없어요.",
    howToCheck: ["참여했던 공공일자리의 종료일을 확인하세요."],
    verified: true,
    source: WORK24_INTRO,
    check: {
      type: "answer",
      question: "publicJob",
      outcomes: yesBlocks("참여 중이거나 끝난 지 6개월이 안 됐으면 참여할 수 없는 것으로 보여요."),
    },
  },
  {
    id: "nes-schooling",
    label: "진학·자격증 목적 재학 아님",
    criterion: "상급학교 진학·전문자격증 목적 재학·수강 중이면 참여 제한",
    plainText: "상급학교 진학이나 전문자격증을 위해 학교·학원에 다니는 중이면 참여할 수 없어요.",
    howToCheck: ["지금 다니는 학교나 학원의 목적이 취업 준비인지 진학·자격증 준비인지 확인하세요."],
    verified: true,
    source: WORK24_INTRO,
    check: {
      type: "answer",
      question: "schooling",
      outcomes: yesBlocks("진학이나 전문자격증 준비 중이면 참여할 수 없는 것으로 보여요."),
    },
  },
];

export const NATIONAL_EMPLOYMENT: Policy = {
  id: "national-employment",
  name: "국민취업지원제도 I유형 (청년)",
  field: "취업",
  summary: "취업 상담과 직업훈련을 지원하고, I유형은 구직촉진수당을 지급해요.",
  benefit: "구직촉진수당 월 60만 원 × 6개월, 부양가족 1명당 월 10만 원 추가 (최대 40만 원)",
  announcement: {
    title: WORK24_SYSTEM.name,
    publishedAt: "2025-12-30",
    url: WORK24_SYSTEM.url,
    checkedAt: INFO_CHECKED_AT,
  },
  application: { kind: "always" },
  applyMethod: "고용24 온라인 신청 또는 고용센터 방문",
  apply: { name: "고용24", url: "https://www.work24.go.kr" },
  contact: "고용노동부 고객상담센터 1350",
  contactPhone: "1350",
  questions,
  questionGroups: [
    {
      id: "basic",
      title: "기본 정보",
      questionIds: ["birthDate", "militaryMonths", "householdSize"],
    },
    {
      id: "money",
      title: "소득·재산",
      description: "가구는 주민등록등본에 함께 올라 있는 부모님·자녀를 포함해요.",
      questionIds: ["householdIncome", "householdAsset", "ownIncome"],
    },
    {
      id: "work",
      title: "일하는 상태",
      questionIds: ["workType", "weeklyHours", "businessIncome", "workExperience"],
    },
    {
      id: "restrictions",
      title: "참여 제한 확인",
      description: "해당하면 I유형에 참여하기 어려운 경우예요.",
      questionIds: ["livelihoodBenefit", "unemploymentBenefit", "publicJob", "schooling"],
    },
  ],
  rules,
  documentsSource: WORK24_INTRO,
  documentsVerified: true,
  documents: [
    {
      id: "job-seeker-registration",
      label: "고용24 회원가입과 구직 등록",
      issuer: { name: "고용24", url: "https://www.work24.go.kr" },
      guide: "취업지원을 신청하기 전에 구직 등록을 먼저 해야 해요.",
    },
    {
      id: "guide-video",
      label: "제도 안내 동영상 1·2회차 수강",
      issuer: { name: "고용24", url: "https://www.work24.go.kr" },
      guide: "신청 전에 고용24에서 두 회차를 모두 들어야 해요.",
    },
    {
      id: "household-consent",
      label: "가구원 개인정보 제공 동의",
      guide:
        "가구원 본인이 개인정보 제공에 동의해야 해요. 신청할 때 휴대전화 인증을 선택하면 동의서를 따로 내지 않아도 돼요.",
    },
  ],
  advisories: [
    {
      id: "selection-type",
      appliesWhen: { question: "workExperience", in: ["no", "unknown"] },
      text: "최근 2년 취업 경험이 100일(800시간) 미만이면 '선발형'으로 심사해요. 조건을 충족해도 예산 상황에 따라 선발되지 않을 수 있어요.",
      source: WORK24_INTRO,
    },
  ],
  recommendation: {
    lclsfNm: "일자리",
    mclsfNm: "취업",
    mclsfQuery: "취업",
    samePolicyNames: ["국민취업지원제도"],
    relevanceKeywords: ["취업", "구직", "일자리", "고용", "채용", "인턴", "직업"],
  },
  alternative: {
    title: "II유형도 있어요 (이 화면에서는 판정하지 않아요)",
    body: [
      "만 15~34세 청년은 소득·재산·취업 경험과 관계없이 II유형에 참여할 수 있어요.",
      "II유형은 구직촉진수당 대신 취업지원 서비스와 취업활동비용 등을 지원해요.",
      "생계급여 수급, 실업급여 수급 같은 참여 제한 대상이면 II유형도 어려울 수 있어요. 고용노동부 고객상담센터(1350)에 확인하세요.",
    ],
    link: { name: "고용24 취업지원신청 소개", url: WORK24_INTRO.url },
    source: WORK24_INTRO,
  },
};
