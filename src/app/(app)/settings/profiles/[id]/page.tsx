import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { getProfile } from "@/server/profiles";
import { ProfileForm } from "../../profile-form";

export default async function EditProfilePage(props: PageProps<"/settings/profiles/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const { id: userId } = await requireUser();
  const profile = await getProfile(userId, id);
  if (!profile) notFound();
  return (
    <>
      <PageHeader title="지원자 정보 수정" description="고쳐도 지난 면접 기록에는 영향이 없습니다." />
      <ProfileForm profile={profile} />
    </>
  );
}
