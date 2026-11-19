"use client";

import { useState } from "react";
import type { Policy } from "@/data/policies";
import type { Blocker, ConditionStatus, Diagnosis, Route } from "@/lib/diagnosis";
import { buildInquiryDraft, buildProposalDraft } from "@/lib/drafts";
import { ApplyAction } from "../ApplyAction";
import { CopyableDraft } from "../CopyableDraft";
import { DocumentChecklist } from "../DocumentChecklist";

const ROUTE_COPY: Record<Route, { tone: string; label: string; title: string; body: string }> = {
  READY: {
    tone: "success",
    label: "신청 준비 항목 완료",
    title: "입력한 내용으로는 신청 준비를 마친 것으로 보여요",
    body: "최종 자격은 공식 기관의 심사로 결정돼요. 공식 사이트에서 조건, 신청기간, 접수 경로를 확인한 뒤 직접 신청해 주세요.",
  },
  ACTION_REQUIRED: {
    tone: "info",
    label: "해결 가능한 장애물",
    title: "입력한 기본 조건은 충족하는 것으로 보여요",
    body: "아래 서류를 준비해 체크해 주세요. 최종 자격은 공식 기관의 심사로 결정돼요.",
  },
  INELIGIBLE: {
    tone: "danger",
    label: "자격 미충족 가능성",
    title: "입력한 내용으로는 충족하지 못한 것으로 보이는 조건이 있어요",
    body: "사유를 확인하고 다른 지원 가능성을 검토해 보세요. 원한다면 정책 개선 제안문을 작성할 수 있어요.",
  },
  NEEDS_INQUIRY: {
    tone: "warning",
    label: "추가 확인 필요",
    title: "아직 판단할 수 없는 조건이 있습니다",
    body: "공식 정보로 확인되지 않은 조건은 임의로 판정하지 않습니다.",
  },
};

const STATUS_LABEL: Record<ConditionStatus, string> = {
  MET: "충족으로 보임",
  NOT_MET: "미충족으로 보임",
  UNKNOWN: "확인 필요",
};

type ResultStepProps = {
  policy: Policy;
  blocker: Blocker;
  diagnosis: Diagnosis;
  checkedDocumentIds: string[];
  inquiryTopic: string;
  inquiryResolved: boolean;
  note: string;
  onToggleDocument: (id: string) => void;
  onInquiryResolvedChange: (resolved: boolean) => void;
  onBack: () => void;
};

export function ResultStep({
  policy,
  blocker,
  diagnosis,
  checkedDocumentIds,
  inquiryTopic,
  inquiryResolved,
  note,
  onToggleDocument,
  onInquiryResolvedChange,
  onBack,
}: ResultStepProps) {
  const [showProposal, setShowProposal] = useState(false);
  const copy = ROUTE_COPY[diagnosis.route];
  const hasEmptyCondition = diagnosis.conditions.some(
    (condition) => condition.status === "UNKNOWN",
  );

  const proposal = buildProposalDraft(policy, diagnosis.conditions, note);
  const inquiry = buildInquiryDraft(policy, inquiryTopic, note);

  return (
    <>
      <p className="eyebrow">STEP 04</p>
      <h2 className="panel-title">진단 결과</h2>

      <div className={`result-banner is-${copy.tone}`} role="status">
        <span className="result-label">{copy.label}</span>
        <strong>{copy.title}</strong>
        <p>{copy.body}</p>
      </div>

      <section className="section">
        <h3>조건 비교</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">조건</th>
                <th scope="col">기준</th>
                <th scope="col">결과</th>
                <th scope="col">내용</th>
              </tr>
            </thead>
            <tbody>
              {diagnosis.conditions.map((condition) => (
                <tr key={condition.id}>
                  <th scope="row">{condition.label}</th>
                  <td>{condition.criterion}</td>
                  <td>
                    <span className={`status is-${condition.status.toLowerCase()}`}>
                      {STATUS_LABEL[condition.status]}
                    </span>
                  </td>
                  <td>{condition.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {diagnosis.route === "ACTION_REQUIRED" && (
        <section className="section">
          <h3>남은 서류 {diagnosis.missingDocuments.length}개</h3>
          <p className="muted">서류를 준비한 뒤 체크하면 진행률에 바로 반영됩니다.</p>
          <DocumentChecklist
            documents={policy.documents}
            checkedIds={checkedDocumentIds}
            onToggle={onToggleDocument}
          />
        </section>
      )}

      {diagnosis.route === "INELIGIBLE" && (
        <section className="section">
          <h3>정책 개선 제안</h3>
          <p className="muted">제도의 기준 때문에 어려움을 겪고 있다면 의견을 제안할 수 있습니다.</p>
          {showProposal ? (
            <CopyableDraft
              key={proposal}
              title="정책 개선 제안문 예시"
              initialText={proposal}
              copyLabel="제안문 복사"
              helper="내용을 검토하고 수정한 뒤 공식 의견제출 채널에 직접 제출해 주세요. 자동으로 제출되지 않습니다."
            />
          ) : (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowProposal(true)}
            >
              정책 개선 제안문 예시 만들기
            </button>
          )}
        </section>
      )}

      {diagnosis.route === "NEEDS_INQUIRY" && hasEmptyCondition && (
        <section className="section">
          <p className="callout">
            비어 있는 자격 조건이 있습니다. 이전 단계에서 입력하면 다시 판정합니다.
          </p>
        </section>
      )}

      {blocker === "unclear" && diagnosis.route !== "INELIGIBLE" && (
        <section className="section">
          <h3>공식 기관 문의</h3>
          <CopyableDraft
            key={inquiry}
            title="기관 문의문"
            initialText={inquiry}
            copyLabel="문의문 복사"
            helper="내용을 검토한 뒤 공식 상담 채널에 직접 문의해 주세요."
          />
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={inquiryResolved}
              onChange={(event) => onInquiryResolvedChange(event.target.checked)}
            />
            <span>공식 기관에 문의해 해당 조건을 충족한다고 확인했어요</span>
          </label>
        </section>
      )}

      {diagnosis.route === "READY" && (
        <section className="section">
          <ApplyAction policy={policy} diagnosis={diagnosis} />
        </section>
      )}

      <p className="notice">
        이 결과는 가상 데이터 기반 시뮬레이션입니다. 실제 자격과 제출서류는 공식 기관의 공고와 심사로
        확정되므로 반드시 공식 기관에서 확인해 주세요.
      </p>

      <div className="actions">
        <button type="button" className="button button-ghost" onClick={onBack}>
          ← 상황 다시 확인
        </button>
      </div>
    </>
  );
}
