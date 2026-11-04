import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "../profile-form";

export default function NewProfilePage() {
  return (
    <>
      <PageHeader title="지원자 정보 추가" />
      <ProfileForm />
    </>
  );
}
