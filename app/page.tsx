import { ProfileForm } from "@/components/profile-form";

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        받을 수 있는 혜택, 왜 놓치고 있을까요?
      </h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        프로필을 입력하면 정책 자격을 계산하고, 신청을 가로막은 원인을 함께 찾아 드려요.
      </p>
      <ProfileForm />
    </div>
  );
}
