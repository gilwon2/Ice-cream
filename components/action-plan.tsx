"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { z } from "zod";
import { MissingProfile } from "@/components/missing-profile";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CONVERSATION_CAUSES, diagnosisSchema, type ConversationCause } from "@/lib/causes";
import { evaluateAll, todayInKorea } from "@/lib/eligibility";
import { buildPlan, type PlanDocument, type PlanGroup, type PlanItem } from "@/lib/plan";
import { policies } from "@/lib/policies";
import { profileSchema, type Profile } from "@/lib/profile";
import { SESSION_KEYS, useSessionValue, writeSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const checklistSchema = z.record(z.string(), z.boolean());

function PolicyRow({ item }: { item: PlanItem }) {
  const canApplyNow = item.result.status === "eligible";
  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{item.policy.name}</h4>
        <StatusBadge status={item.result.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{item.policy.benefit}</p>
      <ul className="mt-2 space-y-1 text-sm leading-relaxed">
        {item.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <a
        href={item.policy.applyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          buttonVariants({ variant: canApplyNow ? "default" : "outline" }),
          "mt-3 h-10 px-3.5",
        )}
      >
        {canApplyNow ? "신청하기" : "신청 안내 보기"}
        <ExternalLink aria-hidden />
      </a>
    </li>
  );
}

function CauseSection({ group }: { group: PlanGroup }) {
  const fromConversation = CONVERSATION_CAUSES.includes(group.cause as ConversationCause);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg font-bold">{group.meta.title}</CardTitle>
          <Badge variant="outline">{fromConversation ? "대화에서 확인" : "자격 계산 결과"}</Badge>
        </div>
        <CardDescription>{group.meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {group.meta.steps.length > 0 && (
          <ol className="grid gap-2">
            {group.meta.steps.map((step, index) => (
              <li key={step} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}
        <ul className="grid gap-3">
          {group.items.map((item) => (
            <PolicyRow key={item.policy.id} item={item} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DocumentChecklist({ documents }: { documents: PlanDocument[] }) {
  const { value } = useSessionValue(SESSION_KEYS.checklist, checklistSchema);
  const checked = value ?? {};
  const doneCount = documents.filter((item) => checked[item.document.id]).length;
  const percent = documents.length ? Math.round((doneCount / documents.length) * 100) : 0;

  return (
    <Card className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto">
      <CardHeader>
        <CardTitle className="text-lg font-bold">서류 체크리스트</CardTitle>
        <CardDescription>
          {documents.length}개 중 {doneCount}개 준비 완료
        </CardDescription>
        <Progress value={percent} aria-label="서류 준비 진행률" className="mt-2" />
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">지금 준비할 서류가 없어요.</p>
        ) : (
          <ul className="grid gap-1">
            {documents.map(({ document, policyNames }) => (
              <li key={document.id}>
                <Label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 font-normal hover:bg-muted">
                  <Checkbox
                    className="mt-0.5"
                    checked={Boolean(checked[document.id])}
                    onCheckedChange={(next) =>
                      writeSession(SESSION_KEYS.checklist, { ...checked, [document.id]: next === true })
                    }
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{document.name}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {document.issuer} · {document.howTo}
                    </span>
                    {policyNames.length > 1 && (
                      <span className="text-xs font-medium text-primary">
                        정책 {policyNames.length}개에 함께 사용
                      </span>
                    )}
                  </span>
                </Label>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlanContent({ profile }: { profile: Profile }) {
  const { value: diagnosis } = useSessionValue(SESSION_KEYS.diagnosis, diagnosisSchema);
  const plan = useMemo(
    () => buildPlan(policies, evaluateAll(policies, profile, todayInKorea()), diagnosis),
    [profile, diagnosis],
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">나의 행동 계획</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            {diagnosis?.summary ??
              "AI 대화 없이 자격 계산 결과로 만든 계획이에요. 진단 대화를 하면 신청을 가로막은 원인까지 반영됩니다."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-3.5")}>
            프로필 수정
          </Link>
          {!diagnosis && (
            <Link href="/diagnosis" className={cn(buttonVariants(), "h-10 px-3.5")}>
              AI 진단하기
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="grid gap-5">
          {plan.groups.map((group) => (
            <CauseSection key={group.cause} group={group} />
          ))}

          {plan.groups.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  지금 프로필로 진행할 수 있는 정책이 없어요. 상황이 바뀌면 프로필을 수정해 다시 계산해 보세요.
                </p>
              </CardContent>
            </Card>
          )}

          {plan.receiving.length > 0 && (
            <p className="text-sm text-muted-foreground">
              이미 이용 중: {plan.receiving.map((policy) => policy.name).join(", ")}
            </p>
          )}

          {plan.ineligible.length > 0 && (
            <section aria-labelledby="ineligible-title" className="rounded-xl bg-muted p-5">
              <h2 id="ineligible-title" className="font-bold">
                이번에는 대상이 아닌 정책
              </h2>
              <ul className="mt-3 grid gap-3">
                {plan.ineligible.map((item) => (
                  <li key={item.policy.id} className="text-sm">
                    <span className="font-semibold">{item.policy.name}</span>
                    {item.notes.map((note) => (
                      <p key={note} className="mt-0.5 text-muted-foreground">
                        {note}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <DocumentChecklist documents={plan.documents} />
      </div>
    </div>
  );
}

export function ActionPlan() {
  const { ready, value } = useSessionValue(SESSION_KEYS.profile, profileSchema);
  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />;
  if (!value) return <MissingProfile />;
  return <PlanContent profile={value} />;
}
