"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INVALID_ACCESS_CODE_MESSAGE } from "@/lib/access-code";

type AccessCodeFormProps = {
  rejected: boolean;
  onSubmit: (code: string) => void;
};

export function AccessCodeForm({ rejected, onSubmit }: AccessCodeFormProps) {
  const inputId = useId();
  const errorId = useId();
  const [code, setCode] = useState("");
  const trimmed = code.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form className="grid gap-2 border-t p-3" onSubmit={handleSubmit}>
      <Label htmlFor={inputId}>데모 접근 코드</Label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          value={code}
          placeholder="접근 코드를 입력해 주세요"
          aria-invalid={rejected}
          aria-describedby={rejected ? errorId : undefined}
          onChange={(event) => setCode(event.target.value)}
          className="h-11 bg-card"
        />
        <Button type="submit" className="h-11 px-4" disabled={!trimmed}>
          확인
        </Button>
      </div>
      {rejected && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {INVALID_ACCESS_CODE_MESSAGE}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        AI 대화에만 필요해요. 코드가 없어도{" "}
        <Link href="/plan" className="underline underline-offset-4">
          자격 판정과 행동 계획
        </Link>
        은 볼 수 있어요.
      </p>
    </form>
  );
}
