import { redirect } from "next/navigation";

/** 예전 주소 호환: 면접 시작은 목록 화면의 모달에서 한다. */
export default async function NewInterviewPage(props: PageProps<"/interviews/new">) {
  const { from, only } = await props.searchParams;
  const params = new URLSearchParams({ start: "1" });
  if (typeof from === "string") params.set("from", from);
  if (typeof only === "string") params.set("only", only);
  redirect(`/interviews?${params}`);
}
