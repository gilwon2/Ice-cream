import type { Policy } from "@/data/policies";

/**
 * 문의문 복사 버튼 옆에 두는 문의처 바로가기.
 * 번호와 주소는 정책 데이터(contactPhone, contactOnline)에 있는 공식 문의처만 쓰고, 없으면 아무것도 그리지 않는다.
 */
export function ContactActions({ policy }: { policy: Policy }) {
  const { contactPhone, contactOnline } = policy;
  if (!contactPhone && !contactOnline) return null;

  return (
    <>
      {contactPhone && (
        <a className="button button-secondary" href={`tel:${contactPhone.replace(/-/g, "")}`}>
          {contactPhone} 전화하기
        </a>
      )}
      {contactOnline && (
        <a
          className="button button-secondary"
          href={contactOnline.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          온라인 문의하기 <span aria-hidden="true">↗</span>
          <span className="sr-only">(새 탭에서 열림)</span>
        </a>
      )}
    </>
  );
}
