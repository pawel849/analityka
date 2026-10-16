import { redirect } from "next/navigation";

/** Kalendarz jest na pulpicie. */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}#kalendarz`);
}
