export type ExternalSite = {
  name: string;
  url: string;
};

export type RequiredDocument = {
  id: string;
  label: string;
  /** 온라인 발급처가 있는 서류만 값을 가진다. */
  issuer?: ExternalSite;
  /** 발급처가 없거나 추가 설명이 필요한 서류의 준비 안내. */
  guide: string;
};

export type Policy = {
  id: string;
  name: string;
  field: string;
  minAge: number;
  maxAge: number;
  /** null이면 전국 대상이다. */
  regions: string[] | null;
  regionLabel: string;
  /** 월소득 상한(만 원) */
  maxMonthlyIncome: number;
  applyMethod: string;
  /** 가상 정책과 분야가 같은 실제 공식 신청 사이트 */
  apply: ExternalSite;
  documents: RequiredDocument[];
};

const residentRegistration: RequiredDocument = {
  id: "resident-registration",
  label: "주민등록등본",
  issuer: {
    name: "정부24",
    url: "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000015",
  },
  guide: "정부24에서 본인 인증 후 발급할 수 있습니다.",
};

export const POLICIES: Policy[] = [
  {
    id: "housing",
    name: "청년 주거비 지원",
    field: "주거",
    minAge: 19,
    maxAge: 34,
    regions: ["서울"],
    regionLabel: "서울",
    maxMonthlyIncome: 250,
    applyMethod: "온라인 신청",
    apply: { name: "복지로", url: "https://www.bokjiro.go.kr" },
    documents: [
      residentRegistration,
      {
        id: "lease-contract",
        label: "임대차계약서",
        guide:
          "공공기관에서 발급하는 서류가 아닙니다. 보관 중인 계약서를 준비하고, 없다면 임대인이나 계약을 중개한 공인중개사에게 사본을 요청해 보세요.",
      },
      {
        id: "rent-payment",
        label: "월세 납부내역",
        guide:
          "공공기관에서 발급하는 서류가 아닙니다. 월세를 이체한 은행의 앱이나 인터넷뱅킹에서 거래내역을 확인해 보세요. 필요한 기간과 형식은 공고에서 확인해야 합니다.",
      },
    ],
  },
  {
    id: "job-seeking",
    name: "청년 구직활동 지원",
    field: "취업",
    minAge: 18,
    maxAge: 34,
    regions: null,
    regionLabel: "전국",
    maxMonthlyIncome: 300,
    applyMethod: "온라인 신청",
    apply: { name: "고용24", url: "https://www.work24.go.kr" },
    documents: [
      residentRegistration,
      {
        id: "job-plan",
        label: "구직활동계획서",
        guide:
          "공공기관에서 발급하는 서류가 아니라 신청자가 직접 작성하는 서류입니다. 양식과 작성 항목은 공고에서 확인해야 합니다.",
      },
      {
        id: "job-registration",
        label: "구직등록 확인서",
        issuer: { name: "고용24", url: "https://www.work24.go.kr" },
        guide: "고용24에 로그인해 구직 등록 여부와 발급 메뉴를 확인할 수 있습니다.",
      },
    ],
  },
];

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
];

export const EMPLOYMENT_STATUSES = ["미취업", "재직 중", "자영업", "학생", "기타"];

export const INQUIRY_TOPICS = [
  "가구 구성 및 세대 기준",
  "소득 산정방식",
  "거주지 인정 기준",
  "그 밖의 자격조건",
];
