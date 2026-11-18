import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MissingProfile() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">프로필을 먼저 입력해 주세요</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        입력한 정보는 이 브라우저 탭에만 보관되어, 탭을 닫으면 사라집니다.
      </p>
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 px-5")}>
        프로필 입력하기
      </Link>
    </div>
  );
}
