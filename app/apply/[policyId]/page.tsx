import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPolicy, policies } from "@/lib/policies";

export function generateStaticParams() {
  return policies.map((policy) => ({ policyId: policy.id }));
}

export default async function ApplyPage({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  const policy = getPolicy(policyId);
  if (!policy) notFound();

  return (
    <div className="mx-auto grid max-w-xl gap-5">
      <Alert>
        <AlertTitle>데모용 신청 페이지</AlertTitle>
        <AlertDescription>가상 정책이므로 실제 신청은 이루어지지 않습니다.</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardDescription>{policy.agency}</CardDescription>
          <CardTitle className="text-xl font-bold">{policy.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm leading-relaxed">
          <p>{policy.summary}</p>
          <p>
            <span className="font-semibold">혜택</span> {policy.benefit}
          </p>
          <div>
            <p className="font-semibold">제출 서류</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {policy.documents.map((document) => (
                <li key={document.id}>{document.name}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
