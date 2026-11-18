# 혜택진단

청년이 정책 혜택을 받지 못하는 원인을 진단하는 프로토타입입니다. 정책은 모두 가상 데이터입니다.

## 실행

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력
npm run dev
```

http://localhost:3000 을 엽니다. API 키가 없어도 프로필 입력, 자격 판정, 행동 계획은 동작합니다.

## 데모 접근 제한

`DEMO_ACCESS_CODE`를 설정하면 진단 화면에서 입력한 코드가 일치할 때만 AI를 호출합니다. 코드가 없어도 자격 판정과 행동 계획은 볼 수 있습니다.

`/api/diagnosis`는 IP별로 1분에 10회까지 허용합니다. 횟수는 서버 프로세스 메모리에 저장되므로, 서버를 재시작하면 초기화되고 여러 인스턴스 사이에는 공유되지 않습니다.

## 화면

1. `/` 프로필 입력
2. `/diagnosis` AI 원인 진단 채팅
3. `/plan` 원인별 행동 계획, 서류 체크리스트, 신청 링크

## 역할 분담

| 구분 | 담당 | 위치 |
| --- | --- | --- |
| 자격 판정 | TypeScript 순수 함수 | `lib/eligibility.ts` |
| 신청하지 못한 행동적 원인 분류 | Claude | `app/api/diagnosis/route.ts` |
| AI 결과 검증과 계획 생성 | TypeScript 함수 | `lib/plan.ts` |
| 정책 데이터 | JSON | `data/policies.json` |

로그인과 DB는 없습니다. 입력값은 브라우저 `sessionStorage`에만 보관되고, 진단 대화 중에는 Claude API로 전송됩니다.

## 검사

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
