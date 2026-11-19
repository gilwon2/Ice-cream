import { INFO_CHECKED_AT, POLICIES } from "@/data/policies";
import { formatIsoDate } from "@/lib/rules";

export function DemoBanner() {
  const announcements = POLICIES.map(
    (policy) => `${policy.name} ${formatIsoDate(policy.announcement.publishedAt)}`,
  ).join(" · ");

  return (
    <div className="demo-banner" role="note">
      <div className="container">
        공식 안내를 바탕으로 한 모의 판정이에요. 실제 자격은 기관 심사로 결정돼요.
        <span className="demo-banner-dates">
          공고 기준일: {announcements} (정보 확인일 {formatIsoDate(INFO_CHECKED_AT)})
        </span>
      </div>
    </div>
  );
}
