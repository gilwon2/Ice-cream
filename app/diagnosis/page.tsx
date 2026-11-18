import { DiagnosisChat } from "@/components/diagnosis-chat";
import { isAccessCodeRequired } from "@/lib/demo-guard";

// 빌드 시점이 아니라 실행 환경의 DEMO_ACCESS_CODE 설정을 따른다.
export const dynamic = "force-dynamic";

export default function DiagnosisPage() {
  return <DiagnosisChat accessCodeRequired={isAccessCodeRequired()} />;
}
