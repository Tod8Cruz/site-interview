import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { isUuid } from "@/server/http";
import { getPrompt } from "@/server/prompts";
import { PromptForm } from "../prompt-form";

export default async function EditPromptPage(props: PageProps<"/prompts/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const { id: userId } = await requireUser();
  const prompt = await getPrompt(userId, id);
  if (!prompt) notFound();
  return (
    <>
      <PageHeader title="프롬프트 수정" description="고쳐도 지난 면접 기록에는 영향이 없습니다." />
      <PromptForm prompt={prompt} />
    </>
  );
}
