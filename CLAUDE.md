# 청년정책 신청 도우미 (youth-policy-helper)

이미 찾은 청년정책을 **왜 신청하지 못하는지 진단**하고, 신청 준비 / 기관 문의문 / 정책 개선 제안문 중 알맞은 다음 행동으로 연결하는 Next.js 앱이다.
「2026 대한민국 청년 CAREER FAIR AI 해커톤」 제출작이다. 대회 규정은 아래 "대회 제약" 절을 따른다.

## 명령어

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest (src/**/*.test.ts)
npm run lint
npm run typecheck
npm run build
```

작업을 끝냈다고 보고하기 전에 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`를 **모두** 실행하고 통과시킨다. 하나라도 실패하면 완료가 아니다.

## 기술 스택

- Next.js 16 (App Router), React 19, TypeScript strict
- Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), 모델 기본값 `claude-sonnet-5-5`
- Zod 4로 모든 API 입력 검증
- Vitest (node 환경), 경로 별칭 `@/` → `src/`
- 스타일: `src/app/globals.css` 하나와 CSS 변수. Tailwind·UI 라이브러리는 쓰지 않는다.

이 Next.js 버전은 학습 데이터와 API가 다를 수 있다. Next.js API를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 확인한다(`AGENTS.md` 참고).

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `src/lib/rules/` | **순수 판정 엔진.** 규칙 평가(`evaluate`), 적용 조건(`when`), 답별 결과 미리보기(`preview`), 날짜·금액·접수 기간 |
| `src/data/policies/` | 정책별 질문, 규칙, 서류, 출처, 접수 기간 (`types.ts`의 `Policy` 형식) |
| `src/data/medianIncome.ts` | 연도별 기준 중위소득 |
| `src/lib/diagnosis.ts` | 판정 결과 종합, 진행률, 최종 경로 |
| `src/lib/drafts.ts` | 문의문·제안문 고정 템플릿 (AI 실패 시 대체용) |
| `src/lib/ai/` | AI 호출. `config`(환경변수), `guard`(호출 제한·접근 코드·본문 검증), `context`, `explain`, `drafts`, `client`(타임아웃), `*Shared.ts`(브라우저와 공유하는 스키마) |
| `src/app/api/` | `ai/session`, `explain`, `drafts` 라우트 |
| `src/components/` | 화면 컴포넌트. 단계 화면은 `steps/`, 전체 흐름은 `PolicyHelper.tsx` |
| `test/stubs/` | 테스트용 `server-only` 대체 모듈 |

## 절대 원칙 (어기면 안 됨)

### 1. 판정은 규칙 엔진만 한다
- 자격 충족 여부(`MET` / `NOT_MET` / `UNKNOWN` / `NOT_APPLICABLE`)는 `src/lib/rules/`만 결정한다.
- AI가 자격을 판정하거나, 판정 결과를 바꾸거나, 결과를 짐작하는 문장을 쓰게 만들지 않는다.
- AI 에이전트 구조로 바꾸더라도 판정 함수(`evaluateRule`, `previewOutcomes`, `diagnose`)는 AI가 **호출하는 도구**로만 노출한다. AI가 숫자를 비교해 판정하게 하지 않는다.
- `src/lib/rules/`는 같은 폴더 파일만 import한다(외부 API·AI import 금지). `rules.test.ts`가 이를 검사하며, 이 테스트를 지우거나 약하게 바꾸지 않는다.
- 서버는 브라우저가 보낸 판정 결과를 믿지 않고 `answers`로 다시 계산한다.

### 2. AI에 개인정보를 보내지 않는다
대회 규정상 동의 여부와 관계없이 외부 AI(API 포함)에 실제 개인정보·민감정보를 보내는 것은 금지다.
- AI 요청 스키마는 `z.strictObject`를 유지한다. 이름, 연락처, 주소, 자유 메모 필드를 추가하지 않는다.
- AI 프롬프트에는 정책 기준, 판정 상태, 공고 출처만 넣는다. 생년월일·출생연도·나이·소득·재산 금액·병역 개월 수 등 **사용자 입력에서 나온 값은 넣지 않는다.** (현재 남아 있는 예외는 "알려진 이슈" 참고)
- 문의문·제안문의 사용자 상황 자리에는 `SITUATION_PLACEHOLDER`를 쓰고, 서명은 `[이름]`, `[연락처]` 자리표시자로 둔다.
- 테스트·시연·예시 데이터는 모두 가상 데이터를 쓴다.

### 3. AI 출력은 검증한 뒤에만 보여준다
- `sanitizeParagraph` 등 출력 검증(모르는 ruleId, 근거에 없는 숫자, 판정 코드, 우회·허위 표현, 링크·마크다운, 과장 표현, 이메일·전화번호 마스킹)을 우회하거나 완화하지 않는다.
- AI 기능은 실패해도 앱이 동작해야 한다. 타임아웃(`AI_TIMEOUT_MS` = 8초), 오류, 접근 코드 없음, 호출 제한이 걸리면 고정 템플릿·기본 안내로 대체한다.
- AI가 만든 내용에는 AI가 작성했다는 표시를 유지한다(예: `AI_DRAFT_NOTICE`).
- 시스템 프롬프트를 바꾸면 해당 `*.test.ts`의 프롬프트·검증 테스트도 함께 갱신한다.

### 4. 비밀 정보
- `ANTHROPIC_API_KEY`, `DEMO_ACCESS_CODE`는 서버 환경변수로만 읽는다(`src/lib/ai/config.ts`, `server-only`).
- `NEXT_PUBLIC_` 접두사를 AI 관련 변수에 붙이지 않는다.
- `.env*` 파일은 커밋하지 않는다(`.env.example`만 예외, 값은 비워 둔다). 새 환경변수를 추가하면 `.env.example`과 README에 설명을 함께 추가한다.
- AI 라우트 보호 순서(호출 제한 → 접근 코드 → 본문 검증)를 유지한다.

## 정책 데이터 규칙

- 규칙마다 `source`(공고명, URL, 게시일)를 둔다. 출처 없는 기준을 추가하지 않는다.
- 공고 원문으로 확인하지 못한 기준은 `verified: false`로 두며, 이 기준에 걸려도 미충족으로 확정하지 않고 "확인 필요"로 판정한다.
- 규칙의 `plainText`, `howToCheck`는 사람이 검수한 문장이다. AI로 생성해서 바꾸지 않는다.
- 기준 금액·날짜·연령을 바꾸면 `rules.test.ts`와 README의 정책 표를 함께 갱신한다.
- 정책을 추가할 때는 `src/data/policies/`에 파일을 만들고 `index.ts`에 등록한 뒤, 판정 테스트를 추가한다.

## 화면·문구 규칙

- 사용자 문구는 한국어 존댓말 "~해요"체로, 짧고 쉽게 쓴다.
- 색은 `globals.css`의 CSS 변수(`--navy`, `--blue`, `--success`, `--danger`, `--warning` 등)만 쓴다. 새 색이 필요하면 변수로 추가한다.
- 판정 결과는 "~로 보여요"처럼 모의 판정임을 드러내고, 실제 자격은 기관 심사로 정해진다는 안내를 지우지 않는다.
- 입력 칸에 이름·연락처·주민등록번호를 넣지 말라는 안내를 유지한다.
- placeholder는 "예: 18"처럼 예시임이 분명하게 쓴다.
- 화면을 바꾸면 데스크톱 1440px과 모바일 390px에서 직접 확인한다(가능하면 Playwright로 스크린샷).

## 코드 스타일

- TypeScript strict. `any`를 쓰지 않는다.
- API 입력은 Zod 스키마로 검증하고, 스키마는 `*Shared.ts`에 두어 브라우저와 공유한다.
- 서버 전용 모듈 첫 줄에 `import "server-only";`를 둔다.
- 컴포넌트 파일은 PascalCase, 라이브러리 파일은 camelCase. 테스트는 같은 폴더에 `*.test.ts`로 둔다.
- 주석은 한국어로, "왜"를 쓴다. 주석이 실제 동작과 다르면 코드와 함께 고친다.
- 기능을 바꾸면 테스트를 먼저 추가하거나 함께 고친다. 테스트를 통과시키려고 기대값을 임의로 바꾸지 않는다.

## 작업 방식

1. 여러 파일을 바꾸는 작업은 먼저 관련 코드를 읽고, 바꿀 파일과 계획을 보여준 뒤 진행한다.
2. 위 "절대 원칙"에 걸리는 변경이 필요해 보이면 진행하지 말고 먼저 이유와 대안을 설명한다.
3. 요청 범위 밖의 리팩터링이나 의존성 추가는 하지 않는다. 새 패키지가 필요하면 라이선스와 함께 먼저 제안한다.
4. 끝나면 바꾼 파일, 이유, 검증 결과(명령어 통과 여부)를 요약한다.

## Git

- 브랜치: `feat/…`, `fix/…`, `style/…`, `docs/…`
- 커밋 메시지는 한국어, 접두사 `feat:` / `fix:` / `style:` / `docs:` / `test:` / `chore:`. 작업 단위로 나눠 커밋한다.
- 커밋 이력을 다시 쓰지 않는다(force push 금지). 개발 이력은 대회 심사 자료다.

## 대회 제약

- **제출 마감: 2026-11-23(월) 17:00 KST.** 마감 후에는 기능·알고리즘·프롬프트·데이터를 바꿀 수 없다. 접속 복구, 인증정보 교체, 실행 환경 복구만 가능하다.
- 마감 직전 커밋에 `v1.0-submission` 태그를 단다.
- 새 오픈소스·데이터·이미지·폰트·AI 도구를 쓰면 README의 "Credits / Licenses"에 이름 / 라이선스 / 링크 / 용도를 추가한다. 제출서의 「AI 활용내역」과 소개서 별첨 표에도 반영해야 하므로 변경 사항을 요약에 따로 적는다.
- GPL 등 소스 공개 의무가 있는 라이선스는 쓰지 않는다.
- 심사위원이 같은 네트워크에서 동시에 접속할 수 있다. 호출 제한과 API 사용량 한도는 이를 고려한다.

## 알려진 이슈 (우선 처리)

- [ ] AI 컨텍스트로 가는 `conditions[].reason`(`src/lib/ai/context.ts`)과 조건 설명용 근거(`src/lib/ai/explain.ts`의 `groundingValue`)에 출생연도·만 나이 등 사용자 입력값이 들어간다. AI용으로는 상태별 고정 문장으로 바꾸고, 입력값이 프롬프트에 포함되지 않는지 테스트를 추가한다. 화면용 `reason`은 유지한다.
- [ ] AI 호출 제한(IP당 1분 10회)을 `AI_RATE_LIMIT_PER_MINUTE` 환경변수로 조정할 수 있게 한다.
- [ ] README에 "Credits / Licenses", "배포 및 환경변수", "개인정보 처리" 절을 추가한다.
- [ ] 결과 화면: 상단 요약과 다음 행동 버튼, AI 작성 버튼을 위로 올리고, 조건 카드는 기본 접힘으로 바꾼다. 모바일에는 상단 고정 진행률 바를 둔다.