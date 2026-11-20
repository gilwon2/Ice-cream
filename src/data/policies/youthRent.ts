import type { Question, Rule, Source, When } from "@/lib/rules";
import { MEDIAN_INCOME_2026 } from "../medianIncome";
import { FAMILY_CERTIFICATE_ISSUER, INFO_CHECKED_AT, YES_NO } from "./common";
import type { Policy } from "./types";

/** 국토교통부 전국 사업 공지. 판정 기준의 원문이다. */
const BOKJIRO_NOTICE: Source = {
  name: "복지로 공지 · 2026년 청년월세 지원 신청 안내",
  url: "https://m.bokjiro.go.kr/ssis-tem/cms/mob/customer/notice/1309500_1155.html",
  publishedAt: "2026-03-20",
};

/**
 * 인천시 사업 안내. 재산 기준, 전입신고, 제외 대상은 여기서만 확인되어
 * 전국 공통 기준인지 공고 원문으로 확인할 때까지 verified: false로 둔다.
 */
const GOV24_INCHEON: Source = {
  name: "정부24 · 인천시 청년월세 지원사업",
  url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/628000000155?administOrgCd=ALL",
  publishedAt: "2026-07-03",
};

const UNVERIFIED_NOTE = "전국 공고 원문으로는 아직 확인하지 못한 기준이에요. 인천시 안내에 나온 내용을 바탕으로 했어요.";

/** 만 30세 미만 미혼이고 미혼부·모가 아니면 부모님(원가구) 소득·재산도 본다. */
const PARENT_REVIEW: When = {
  all: [
    { birthDateQuestion: "birthDate", ageBelow: 30 },
    { question: "maritalStatus", in: ["single"] },
    { not: { question: "singleParent", in: ["yes"] } },
  ],
};

const PARENT_EXEMPT_REASON =
  "만 30세 이상이거나, 혼인했거나, 미혼부·모이면 부모님 소득·재산은 보지 않아요.";

const questions: Question[] = [
  {
    id: "birthDate",
    kind: "date",
    label: "생년월일",
    help: "출생연도와 만 나이를 계산하는 데만 쓰고 저장하지 않아요.",
  },
  {
    id: "maritalStatus",
    kind: "choice",
    label: "혼인 여부",
    options: [
      { value: "single", label: "미혼" },
      { value: "married", label: "기혼" },
    ],
  },
  {
    id: "singleParent",
    kind: "choice",
    label: "미혼부 또는 미혼모인가요?",
    options: YES_NO,
    appliesWhen: { question: "maritalStatus", in: ["single"] },
  },
  {
    id: "ownsHouse",
    kind: "choice",
    label: "주택을 가지고 있나요?",
    help: "분양권·입주권도 주택으로 볼 수 있어요.",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "livesApart",
    kind: "choice",
    label: "부모님과 따로 살고 있나요?",
    help: "주민등록상 세대도 부모님과 나뉘어 있어야 해요.",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "movedIn",
    kind: "choice",
    label: "지금 사는 집에 전입신고를 했나요?",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "publicRental",
    kind: "choice",
    label: "지금 사는 집이 공공임대주택인가요?",
    help: "LH, SH 같은 공공기관이 빌려주는 집이에요.",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "relativeLandlord",
    kind: "choice",
    label: "집주인이 부모님, 조부모님, 형제자매 등 2촌 이내 가족인가요?",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "otherRentSupport",
    kind: "choice",
    label: "지금 국토교통부나 지자체의 다른 월세 지원을 받고 있나요?",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "used24",
    kind: "choice",
    label: "예전 청년월세 지원(한시 특별지원 포함)을 24회 모두 받았나요?",
    options: YES_NO,
    allowUnknown: true,
  },
  {
    id: "youthHouseholdSize",
    kind: "number",
    label: "청년가구 가구원 수",
    help: "본인, 배우자, 자녀, 같은 주소에 사는 가족을 합한 수예요. 혼자 살면 1명이에요.",
    unit: "명",
    integer: true,
    placeholder: "예: 1",
  },
  {
    id: "youthIncome",
    kind: "number",
    label: "청년가구 월소득 합계",
    help: "청년가구 구성원의 월평균 소득을 합한 금액이에요.",
    unit: "만 원",
    placeholder: "예: 150",
    allowUnknown: true,
  },
  {
    id: "youthAsset",
    kind: "number",
    label: "청년가구 재산 합계",
    help: "임차보증금, 예금 같은 재산을 합한 금액이에요.",
    unit: "만 원",
    placeholder: "예: 3000",
    allowUnknown: true,
  },
  {
    id: "parentHouseholdSize",
    kind: "number",
    label: "부모님을 포함한 원가구 가구원 수",
    help: "청년가구 가구원 수에 부모님을 더한 수예요.",
    unit: "명",
    integer: true,
    placeholder: "예: 3",
    appliesWhen: PARENT_REVIEW,
  },
  {
    id: "parentIncome",
    kind: "number",
    label: "원가구 월소득 합계",
    help: "청년가구와 부모님의 월평균 소득을 모두 합한 금액이에요.",
    unit: "만 원",
    placeholder: "예: 450",
    allowUnknown: true,
    appliesWhen: PARENT_REVIEW,
  },
  {
    id: "parentAsset",
    kind: "number",
    label: "원가구 재산 합계",
    help: "청년가구와 부모님의 재산을 모두 합한 금액이에요.",
    unit: "만 원",
    placeholder: "예: 30000",
    allowUnknown: true,
    appliesWhen: PARENT_REVIEW,
  },
];

const rules: Rule[] = [
  {
    id: "rent-age",
    label: "연령",
    criterion: "1991~2007년생 (만 19~34세)",
    plainText: "2026년 공고는 1991년부터 2007년 사이에 태어난 청년이 대상이에요.",
    howToCheck: ["신분증이나 주민등록등본의 생년월일을 확인하세요."],
    verified: true,
    source: BOKJIRO_NOTICE,
    check: { type: "birthYearRange", question: "birthDate", min: 1991, max: 2007 },
  },
  {
    id: "rent-no-house",
    label: "무주택",
    criterion: "무주택 청년",
    plainText: "집을 가지고 있지 않은 청년만 신청할 수 있어요.",
    howToCheck: [
      "본인 명의의 주택, 분양권, 입주권이 있는지 확인하세요.",
      "주택 소유 여부를 가구원 누구까지 보는지는 공고에서 확인하세요.",
    ],
    verified: true,
    source: BOKJIRO_NOTICE,
    check: {
      type: "answer",
      question: "ownsHouse",
      outcomes: {
        no: { status: "MET", reason: "주택이 없는 것으로 보여요." },
        yes: { status: "NOT_MET", reason: "주택이 있으면 지원 대상이 아닌 것으로 보여요." },
      },
    },
  },
  {
    id: "rent-lives-apart",
    label: "부모님과 별도 거주",
    criterion: "부모님과 따로 사는 청년",
    plainText: "부모님 집이 아닌 곳에서 월세를 내며 사는 청년이 대상이에요.",
    howToCheck: ["주민등록등본에서 부모님과 세대가 나뉘어 있는지 확인하세요."],
    verified: true,
    source: BOKJIRO_NOTICE,
    check: {
      type: "answer",
      question: "livesApart",
      outcomes: {
        yes: { status: "MET", reason: "부모님과 따로 사는 것으로 보여요." },
        no: {
          status: "NOT_MET",
          reason: "부모님과 함께 살면 지원 대상이 아닌 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "rent-moved-in",
    label: "전입신고",
    criterion: "지금 사는 집에 전입신고 완료",
    plainText: `월세를 내는 집 주소로 전입신고가 되어 있어야 해요. ${UNVERIFIED_NOTE}`,
    howToCheck: ["주민등록등본의 주소가 지금 사는 집과 같은지 확인하세요."],
    verified: false,
    source: GOV24_INCHEON,
    check: {
      type: "answer",
      question: "movedIn",
      outcomes: {
        yes: { status: "MET", reason: "전입신고를 한 것으로 보여요." },
        no: {
          status: "NOT_MET",
          reason: "전입신고가 되어 있지 않으면 지원받기 어려운 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "rent-public-rental",
    label: "공공임대주택 거주 아님",
    criterion: "공공임대주택 거주자는 제외",
    plainText: `공공임대주택에 사는 청년은 지원 대상에서 빠져요. ${UNVERIFIED_NOTE}`,
    howToCheck: ["임대차계약서의 임대인이 LH, SH 같은 공공기관인지 확인하세요."],
    verified: false,
    source: GOV24_INCHEON,
    check: {
      type: "answer",
      question: "publicRental",
      outcomes: {
        no: { status: "MET", reason: "공공임대주택에 살지 않는 것으로 보여요." },
        yes: {
          status: "NOT_MET",
          reason: "공공임대주택에 살면 지원 대상이 아닌 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "rent-relative-landlord",
    label: "가족 소유 주택 임차 아님",
    criterion: "2촌 이내 혈족의 주택 임차는 제외",
    plainText: `부모님, 조부모님, 형제자매 등 가까운 가족의 집을 빌린 경우는 지원하지 않아요. ${UNVERIFIED_NOTE}`,
    howToCheck: ["임대차계약서의 임대인 이름과 가족관계를 확인하세요."],
    verified: false,
    source: GOV24_INCHEON,
    check: {
      type: "answer",
      question: "relativeLandlord",
      outcomes: {
        no: { status: "MET", reason: "가족이 아닌 집주인에게 빌린 것으로 보여요." },
        yes: {
          status: "NOT_MET",
          reason: "2촌 이내 가족의 집을 빌리면 지원 대상이 아닌 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "rent-other-support",
    label: "다른 월세 지원과 중복 아님",
    criterion: "국토교통부·지자체 월세 지원 수혜 중이면 제외",
    plainText: `이미 다른 월세 지원을 받고 있으면 그 지원이 끝난 뒤에 신청할 수 있어요. ${UNVERIFIED_NOTE}`,
    howToCheck: ["지자체 청년 월세 지원을 받고 있는지 주민센터나 지자체 누리집에서 확인하세요."],
    verified: false,
    source: GOV24_INCHEON,
    check: {
      type: "answer",
      question: "otherRentSupport",
      outcomes: {
        no: { status: "MET", reason: "다른 월세 지원을 받고 있지 않은 것으로 보여요." },
        yes: {
          status: "NOT_MET",
          reason: "다른 월세 지원을 받는 중이면 지금은 신청하기 어려운 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "rent-used-24",
    label: "지원 횟수",
    criterion: "1·2차 사업 합산 1인당 최대 24회",
    plainText: "청년월세 지원은 예전 사업까지 합쳐 한 사람당 24회까지만 받을 수 있어요.",
    howToCheck: ["복지로 신청 내역이나 국토교통부 콜센터(1599-0001)에서 받은 회차를 확인하세요."],
    verified: true,
    source: BOKJIRO_NOTICE,
    check: {
      type: "answer",
      question: "used24",
      outcomes: {
        no: { status: "MET", reason: "아직 24회를 모두 받지 않은 것으로 보여요." },
        yes: {
          status: "NOT_MET",
          reason: "이미 24회를 모두 받았으면 더 지원받을 수 없는 것으로 보여요.",
        },
      },
    },
  },
  {
    id: "rent-youth-income",
    label: "청년가구 소득",
    criterion: "청년가구 기준 중위소득 60% 이하",
    plainText: "본인(과 배우자 등 함께 사는 가족)의 월소득 합계가 기준 중위소득의 60% 이하여야 해요.",
    howToCheck: [
      "급여명세서나 홈택스 소득금액증명으로 월평균 소득을 확인하세요.",
      "소득으로 인정하는 항목은 신청할 때 공적자료로 다시 조회해요.",
    ],
    verified: true,
    source: BOKJIRO_NOTICE,
    check: {
      type: "medianIncomeRatio",
      question: "youthIncome",
      householdSizeQuestion: "youthHouseholdSize",
      percent: 60,
      table: MEDIAN_INCOME_2026,
    },
  },
  {
    id: "rent-youth-asset",
    label: "청년가구 재산",
    criterion: "청년가구 재산 1억 2,200만 원 이하",
    plainText: `청년가구가 가진 재산 합계가 1억 2,200만 원 이하여야 해요. ${UNVERIFIED_NOTE}`,
    howToCheck: [
      "임차보증금, 예금, 자동차 등 가진 재산을 더해 보세요.",
      "재산으로 인정하는 항목과 부채 차감 여부는 공고에서 확인하세요.",
    ],
    verified: false,
    source: GOV24_INCHEON,
    check: { type: "maxAmount", question: "youthAsset", maxWon: 122_000_000 },
  },
  {
    id: "rent-parent-income",
    label: "원가구 소득",
    criterion: "부모님 포함 원가구 기준 중위소득 100% 이하",
    plainText: "만 30세 미만 미혼이면 부모님까지 합친 가구의 월소득도 기준 중위소득 100% 이하여야 해요.",
    howToCheck: [
      "부모님의 소득은 부모님께 확인하거나 소득금액증명으로 확인하세요.",
      "만 30세 미만 미혼이라도 일정 소득이 있고 부모님과 생계를 달리한다고 인정받으면 제외될 수 있어요. 주민센터에 문의하세요.",
    ],
    verified: true,
    source: BOKJIRO_NOTICE,
    appliesWhen: PARENT_REVIEW,
    notApplicableReason: PARENT_EXEMPT_REASON,
    check: {
      type: "medianIncomeRatio",
      question: "parentIncome",
      householdSizeQuestion: "parentHouseholdSize",
      percent: 100,
      table: MEDIAN_INCOME_2026,
    },
  },
  {
    id: "rent-parent-asset",
    label: "원가구 재산",
    criterion: "부모님 포함 원가구 재산 4억 7,000만 원 이하",
    plainText: `만 30세 미만 미혼이면 부모님까지 합친 가구의 재산도 4억 7,000만 원 이하여야 해요. ${UNVERIFIED_NOTE}`,
    howToCheck: ["부모님 명의의 집, 예금, 자동차 등 재산 규모를 부모님께 확인하세요."],
    verified: false,
    source: GOV24_INCHEON,
    appliesWhen: PARENT_REVIEW,
    notApplicableReason: PARENT_EXEMPT_REASON,
    check: { type: "maxAmount", question: "parentAsset", maxWon: 470_000_000 },
  },
];

export const YOUTH_RENT: Policy = {
  id: "youth-rent",
  name: "청년월세 지원",
  field: "주거",
  summary: "부모님과 따로 사는 무주택 청년에게 월세를 지원해요.",
  benefit: "월 최대 20만 원, 최대 24개월 (생애 1회)",
  announcement: {
    title: BOKJIRO_NOTICE.name,
    publishedAt: "2026-03-20",
    url: BOKJIRO_NOTICE.url,
    checkedAt: INFO_CHECKED_AT,
  },
  application: {
    kind: "period",
    start: "2026-03-30T09:00:00+09:00",
    end: "2026-05-29T16:00:00+09:00",
    closedTitle: "2026년 접수 마감",
  },
  closedGuide: [
    "2026년 신규 신청은 2026년 5월 29일 16시에 마감됐어요.",
    "다음 공고는 복지로 공지사항에서 확인할 수 있어요. 문의는 국토교통부 청년월세 콜센터(1599-0001)로 하면 돼요.",
    "기준 중위소득은 해마다 바뀌어요. 다음 공고가 나오면 소득 기준을 다시 확인하세요.",
    "임대차계약서 확정일자와 월세 계좌이체 내역을 미리 챙겨 두면 다음 신청이 빨라져요.",
  ],
  applyMethod: "복지로 온라인 신청",
  apply: { name: "복지로", url: "https://www.bokjiro.go.kr" },
  contact: "국토교통부 청년월세 콜센터 1599-0001",
  questions,
  questionGroups: [
    {
      id: "basic",
      title: "기본 정보",
      description: "나이와 혼인 여부에 따라 부모님 소득을 볼지가 정해져요.",
      questionIds: ["birthDate", "maritalStatus", "singleParent"],
    },
    {
      id: "housing",
      title: "주거 상황",
      questionIds: ["ownsHouse", "livesApart", "movedIn"],
    },
    {
      id: "exclusions",
      title: "중복 지원·제외 대상",
      description: "해당하면 지원받기 어려운 경우예요.",
      questionIds: ["publicRental", "relativeLandlord", "otherRentSupport", "used24"],
    },
    {
      id: "youth-money",
      title: "청년가구 소득·재산",
      questionIds: ["youthHouseholdSize", "youthIncome", "youthAsset"],
    },
    {
      id: "parent-money",
      title: "부모님 포함 원가구 소득·재산",
      description: "만 30세 미만 미혼이면 부모님 소득·재산도 함께 봐요.",
      questionIds: ["parentHouseholdSize", "parentIncome", "parentAsset"],
    },
  ],
  rules,
  documentsSource: GOV24_INCHEON,
  documentsVerified: false,
  documents: [
    {
      id: "lease-contract",
      label: "확정일자를 받은 임대차계약서 사본",
      guide:
        "보관 중인 계약서를 준비하세요. 확정일자를 받지 않았다면 주민센터나 인터넷등기소에서 받을 수 있어요.",
    },
    {
      id: "rent-transfer",
      label: "최근 3개월 월세 이체 내역",
      guide:
        "월세를 보낸 은행 앱이나 인터넷뱅킹에서 이체 내역을 내려받으세요. 계약한 지 3개월이 안 됐다면 1개월 이상 내역이 필요해요.",
    },
    {
      id: "bankbook",
      label: "통장 사본",
      guide: "지원금을 받을 본인 명의 통장의 사본을 준비하세요.",
    },
    {
      id: "family-certificate",
      label: "상세 가족관계증명서 (본인)",
      issuer: FAMILY_CERTIFICATE_ISSUER,
      guide: "전자가족관계등록시스템에서 발급할 수 있어요.",
    },
    {
      id: "parent-family-certificate",
      label: "부·모 각각의 상세 가족관계증명서",
      issuer: FAMILY_CERTIFICATE_ISSUER,
      guide: "부모님 기준으로 각각 발급해야 해요.",
    },
  ],
  advisories: [],
  recommendation: {
    lclsfNm: "주거",
    mclsfNm: "전월세 및 주거급여 지원",
    mclsfQuery: "전월세",
    // 국토교통부 청년월세 지원과 그 한시 특별지원. "구미형 청년월세 지원사업" 같은 지자체 자체 사업은 남긴다.
    samePolicyNames: ["청년월세지원", "청년월세한시특별지원", "청년월세특별지원"],
    // 같은 중분류로 분류됐지만 교통 정책처럼 주거와 관계없는 항목이 섞여 와서 순서를 보완한다.
    relevanceKeywords: ["주거", "월세", "전세", "임대", "임차", "주택", "보증금"],
  },
};
