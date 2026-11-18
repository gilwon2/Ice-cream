"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/", label: "프로필" },
  { href: "/diagnosis", label: "AI 진단" },
  { href: "/plan", label: "행동 계획" },
];

export function StepHeader() {
  const pathname = usePathname();
  const current = STEPS.findIndex((step) => step.href === pathname);

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="shrink-0 text-base font-bold tracking-tight text-primary">
          혜택진단
        </Link>
        <ol className="flex items-center gap-1 text-xs sm:gap-3 sm:text-sm">
          {STEPS.map((step, index) => {
            const active = index === current;
            const done = current > index;
            return (
              <li
                key={step.href}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1",
                  active ? "bg-secondary font-semibold text-secondary-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    active || done ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {index + 1}
                </span>
                <span className={cn(!active && "hidden sm:inline")}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}
