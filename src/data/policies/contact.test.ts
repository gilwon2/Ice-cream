import { describe, expect, it } from "vitest";
import { POLICIES } from "./index";

describe("정책 문의처", () => {
  it("전화 바로가기 번호는 공식 문의처 문구에 적힌 번호와 같다", () => {
    for (const policy of POLICIES) {
      if (!policy.contactPhone) continue;
      expect(policy.contact, policy.id).toContain(policy.contactPhone);
      expect(policy.contactPhone, policy.id).toMatch(/^\d[\d-]*\d$/);
    }
  });

  it("온라인 문의 주소는 https 주소만 쓴다", () => {
    for (const policy of POLICIES) {
      if (!policy.contactOnline) continue;
      expect(policy.contactOnline.url, policy.id).toMatch(/^https:\/\//);
    }
  });
});
