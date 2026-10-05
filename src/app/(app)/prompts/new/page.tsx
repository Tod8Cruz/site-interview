import { PageHeader } from "@/components/page-header";
import { PromptForm } from "../prompt-form";

export default function NewPromptPage() {
  return (
    <>
      <PageHeader title="프롬프트 추가" />
      <PromptForm />
    </>
  );
}
