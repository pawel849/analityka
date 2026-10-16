import { notFound } from "next/navigation";
import { AdTestView } from "@/components/adtests/AdTestView";
import { projectOfTest } from "@/lib/ad-tests-data";

export default async function AdTestPage({ params, searchParams }: { params: Promise<{ id: string; testId: string }>; searchParams: Promise<{ nowa?: string }> }) {
  const { id, testId } = await params;
  const { nowa } = await searchParams;
  if ((await projectOfTest(testId)) !== id) notFound();
  return <AdTestView projectId={id} testId={testId} openCreator={nowa === "1"} />;
}
