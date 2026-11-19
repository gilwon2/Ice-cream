import { INQUIRY_TOPICS, type Policy, type RequiredDocument } from "@/data/policies";
import { questionPages, type Blocker } from "@/lib/diagnosis";
import { primaryQuestionId, type Answers, type Question, type RuleResult } from "@/lib/rules";
import { DocumentChecklist } from "../DocumentChecklist";
import { QuestionField } from "../QuestionField";

const NOTE_COPY: Record<Blocker, { label: string; placeholder: string }> = {
  documents: {
    label: "막힌 상황을 한 문장으로 설명하기 (선택)",
    placeholder: "예: 어떤 서류를 어디서 발급받는지 모르겠어요.",
  },
  eligibility: {
    label: "정책 기준과 별개로 어려운 점 (선택)",
    placeholder: "예: 소득이 조금 높지만 매달 주거비가 많이 들어 부담스러워요.",
  },
  unclear: {
    label: "상황 설명 (선택)",
    placeholder: "예: 부모님과 다른 주소에 살고 있는데 가구 기준이 궁금해요.",
  },
};

type SituationStepProps = {
  policy: Policy;
  blocker: Blocker;
  answers: Answers;
  now: Date;
  conditions: RuleResult[];
  documents: RequiredDocument[];
  checkedDocumentIds: string[];
  inquiryTopic: string;
  note: string;
  page: number;
  onAnswer: (questionId: string, value: string) => void;
  onToggleDocument: (id: string) => void;
  onInquiryTopicChange: (topic: string) => void;
  onNoteChange: (note: string) => void;
  onPageChange: (page: number) => void;
  /** 설명 카드의 "문의문 작성으로 이동" */
  onRequestInquiry: (ruleId: string) => void;
  /** 설명 카드를 열어 본 조건 기록 */
  onExplanationViewed: (ruleId: string) => void;
  onBack: () => void;
  onNext: () => void;
};

type Page =
  | { kind: "questions"; title: string; description?: string; questions: Question[] }
  | { kind: "prepare"; title: string };

export function SituationStep({
  policy,
  blocker,
  answers,
  now,
  conditions,
  documents,
  checkedDocumentIds,
  inquiryTopic,
  note,
  page,
  onAnswer,
  onToggleDocument,
  onInquiryTopicChange,
  onNoteChange,
  onPageChange,
  onRequestInquiry,
  onExplanationViewed,
  onBack,
  onNext,
}: SituationStepProps) {
  const prepare: Page = {
    kind: "prepare",
    title: blocker === "unclear" ? "서류와 문의 준비" : "제출서류 준비",
  };
  const questionList: Page[] = questionPages(policy, answers, now).map((item) => ({
    kind: "questions",
    title: item.group.title,
    description: item.group.description,
    questions: item.questions,
  }));
  // 서류가 막힌 경우에는 서류부터 보여준다.
  const pages = blocker === "documents" ? [prepare, ...questionList] : [...questionList, prepare];
  const index = Math.min(page, pages.length - 1);
  const current = pages[index];
  const isLast = index === pages.length - 1;

  const hintsFor = (question: Question) =>
    policy.rules
      .filter((rule) => primaryQuestionId(rule) === question.id)
      .map((rule) => conditions.find((condition) => condition.ruleId === rule.id))
      .filter(
        (condition): condition is RuleResult =>
          Boolean(condition) && condition?.status !== "NOT_APPLICABLE",
      );

  // 질문마다 그 질문을 주로 묻는 규칙을 설명 카드로 연결한다.
  const explainFor = (question: Question) => {
    const rule = policy.rules.find((item) => primaryQuestionId(item) === question.id);
    return rule
      ? { policy, rule, answers, onRequestInquiry, onViewed: onExplanationViewed }
      : undefined;
  };

  const goNext = () => (isLast ? onNext() : onPageChange(index + 1));

  return (
    // 입력칸에서 Enter를 누르면 다음 단계로 넘어간다.
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        goNext();
      }}
    >
      <p className="eyebrow">
        STEP 03 · {index + 1}/{pages.length}
      </p>
      <h2 className="panel-title">{current.title}</h2>

      {current.kind === "questions" ? (
        <>
          {current.description && <p className="muted">{current.description}</p>}
          <div className="question-list">
            {current.questions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id] ?? ""}
                now={now}
                onChange={(value) => onAnswer(question.id, value)}
                hints={hintsFor(question)}
                explain={explainFor(question)}
              />
            ))}
          </div>
          <p className="hint">
            모르는 항목은 &lsquo;모르겠어요&rsquo;를 고르거나 비워 두세요. 결과 화면에서 확인 방법을
            알려드려요.
          </p>
        </>
      ) : (
        <>
          <section className="section section-first">
            <h3>제출서류 체크리스트</h3>
            <p className="muted">
              준비가 끝난 서류에 체크하세요. 발급 사이트에서 서류를 받은 뒤 이 화면으로 돌아와 직접
              체크하면 진행률이 올라갑니다.
            </p>
            {!policy.documentsVerified && (
              <p className="callout callout-small">
                서류 목록은 {policy.documentsSource.name} 안내를 바탕으로 했어요. 신청 전에 공고에서
                최종 확인해 주세요.
              </p>
            )}
            <DocumentChecklist
              documents={documents}
              checkedIds={checkedDocumentIds}
              onToggle={onToggleDocument}
            />
          </section>

          {blocker === "unclear" && (
            <section className="section">
              <h3>확인이 필요한 주제</h3>
              <p className="muted">정확하게 판단하기 어려운 부분을 선택해 주세요.</p>
              <div className="pill-group" role="radiogroup" aria-label="확인이 필요한 주제">
                {INQUIRY_TOPICS.map((topic) => (
                  <label
                    key={topic}
                    className={`pill${inquiryTopic === topic ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="inquiry-topic"
                      checked={inquiryTopic === topic}
                      onChange={() => onInquiryTopicChange(topic)}
                    />
                    {topic}
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <label className="field-label" htmlFor="note">
              {NOTE_COPY[blocker].label}
            </label>
            <textarea
              id="note"
              rows={3}
              placeholder={NOTE_COPY[blocker].placeholder}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
            <p className="hint">이름, 연락처, 주민등록번호 같은 개인정보는 입력하지 마세요.</p>
          </section>
        </>
      )}

      <div className="actions">
        <button
          type="button"
          className="button button-ghost"
          onClick={() => (index === 0 ? onBack() : onPageChange(index - 1))}
        >
          ← 이전
        </button>
        <button type="submit" className="button button-primary">
          {isLast ? "진단 결과 확인 →" : "다음 →"}
        </button>
      </div>
    </form>
  );
}
