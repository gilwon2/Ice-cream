"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowRight, ChevronDown, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod";
import { EligibilityPanel } from "@/components/eligibility-panel";
import { MissingProfile } from "@/components/missing-profile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { diagnosisSchema, type Diagnosis } from "@/lib/causes";
import { buildOpener } from "@/lib/diagnosis-prompt";
import { evaluateAll, todayInKorea } from "@/lib/eligibility";
import { policies } from "@/lib/policies";
import { profileSchema, type Profile } from "@/lib/profile";
import {
  clearSession,
  readSession,
  SESSION_KEYS,
  useSessionValue,
  writeSession,
} from "@/lib/session";
import { cn } from "@/lib/utils";

const QUICK_REPLIES = [
  "이런 정책이 있는 줄 몰랐어요",
  "서류 준비가 너무 어려웠어요",
  "저는 대상이 아닐 것 같았어요",
  "신청할 시간이 없었어요",
];

const FINISH_MESSAGE = "지금까지 이야기한 내용으로 진단을 마무리해 주세요.";
const MAX_INPUT_LENGTH = 500;

const storedMessagesSchema = z.array(
  z.looseObject({
    id: z.string(),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(z.looseObject({ type: z.string() })),
  }),
);

function messageText(message: UIMessage) {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();
}

function findDiagnosis(messages: UIMessage[]): Diagnosis | null {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-submit_diagnosis" && "output" in part) {
        const parsed = diagnosisSchema.safeParse(part.output);
        if (parsed.success) return parsed.data;
      }
    }
  }
  return null;
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          role === "user"
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function Chat({ profile }: { profile: Profile }) {
  const results = useMemo(() => evaluateAll(policies, profile, todayInKorea()), [profile]);
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/diagnosis", body: { profile } }),
    [profile],
  );
  const [initialMessages] = useState(
    () => (readSession(SESSION_KEYS.messages, storedMessagesSchema) ?? []) as UIMessage[],
  );
  const { messages, sendMessage, regenerate, setMessages, clearError, status, error } = useChat({
    messages: initialMessages,
    transport,
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const diagnosis = useMemo(() => findDiagnosis(messages), [messages]);
  const hasUserMessage = messages.some((message) => message.role === "user");
  const lastMessage = messages.at(-1);
  const emptyReply =
    status === "ready" &&
    lastMessage?.role === "assistant" &&
    !messageText(lastMessage) &&
    !diagnosis;

  useEffect(() => {
    if (!busy) writeSession(SESSION_KEYS.messages, messages);
  }, [busy, messages]);

  useEffect(() => {
    if (diagnosis) writeSession(SESSION_KEYS.diagnosis, diagnosis);
  }, [diagnosis]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status, error]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || diagnosis) return;
    clearError();
    setInput("");
    void sendMessage({ text: trimmed });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter는 글자 확정이므로 전송하지 않는다.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(input);
    }
  };

  const restart = () => {
    clearError();
    setMessages([]);
    clearSession(SESSION_KEYS.messages, SESSION_KEYS.diagnosis);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <details className="group rounded-xl bg-card ring-1 ring-foreground/10 lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
          자격 판정 결과 보기
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4">
          <EligibilityPanel results={results} />
        </div>
      </details>

      <Card className="h-[calc(100dvh-11rem)] min-h-[30rem] gap-0 py-0 lg:h-[calc(100dvh-12rem)]">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h1 className="text-base font-bold">AI 원인 진단</h1>
            <p className="text-xs text-muted-foreground">신청을 가로막은 이유를 함께 찾아요</p>
          </div>
          {hasUserMessage && (
            <Button variant="ghost" className="h-9 px-2 text-muted-foreground" onClick={restart} disabled={busy}>
              <RotateCcw aria-hidden />
              다시 하기
            </Button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          <Bubble role="assistant">{buildOpener(results)}</Bubble>

          {!hasUserMessage && (
            <div className="flex flex-wrap gap-2">
              {QUICK_REPLIES.map((reply) => (
                <Button
                  key={reply}
                  variant="outline"
                  className="h-10 rounded-full px-3.5"
                  onClick={() => send(reply)}
                >
                  {reply}
                </Button>
              ))}
            </div>
          )}

          {messages.map((message) => {
            const text = messageText(message);
            if (!text || message.role === "system") return null;
            return (
              <Bubble key={message.id} role={message.role}>
                {text}
              </Bubble>
            );
          })}

          {status === "submitted" && (
            <p className="text-xs text-muted-foreground" role="status">
              답변을 준비하고 있어요…
            </p>
          )}

          {(error || emptyReply) && (
            <Alert variant="destructive">
              <AlertDescription className="grid gap-2">
                <span>{error?.message || "답변을 완성하지 못했어요. 다시 시도해 주세요."}</span>
                <Button variant="outline" className="h-9 w-fit px-3" onClick={() => void regenerate()}>
                  다시 시도
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {diagnosis && (
            <div className="rounded-xl bg-secondary p-4 text-secondary-foreground">
              <p className="text-sm font-semibold">진단이 끝났어요</p>
              <p className="mt-1 text-sm leading-relaxed">{diagnosis.summary}</p>
              <Link href="/plan" className={cn(buttonVariants({ size: "lg" }), "mt-3 h-11 px-4")}>
                행동 계획 보기
                <ArrowRight aria-hidden />
              </Link>
            </div>
          )}
        </div>

        {!diagnosis && (
          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                aria-label="진단 메시지 입력"
                value={input}
                maxLength={MAX_INPUT_LENGTH}
                rows={1}
                placeholder="편하게 이야기해 주세요"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                className="max-h-32 min-h-11 resize-none bg-card"
              />
              <Button
                size="icon-lg"
                className="size-11"
                aria-label="보내기"
                disabled={busy || !input.trim()}
                onClick={() => send(input)}
              >
                <Send aria-hidden />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="h-9 px-2 text-primary"
                disabled={busy || !hasUserMessage}
                onClick={() => send(FINISH_MESSAGE)}
              >
                진단 마치기
              </Button>
              <Link
                href="/plan"
                className="inline-flex min-h-9 items-center px-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                대화 없이 결과 보기
              </Link>
            </div>
          </div>
        )}
      </Card>

      <Card className="hidden lg:sticky lg:top-20 lg:flex">
        <CardHeader>
          <CardTitle>자격 판정 결과</CardTitle>
          <p className="text-xs text-muted-foreground">AI가 아닌 정해진 규칙으로 계산했어요</p>
        </CardHeader>
        <CardContent>
          <EligibilityPanel results={results} />
        </CardContent>
      </Card>
    </div>
  );
}

export function DiagnosisChat() {
  const { ready, value } = useSessionValue(SESSION_KEYS.profile, profileSchema);
  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />;
  if (!value) return <MissingProfile />;
  return <Chat profile={value} />;
}
