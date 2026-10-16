import { guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { listTests, testResults } from "@/lib/loop";

export const dynamic = "force-dynamic";
export const GET = guarded(async (_req, { params }: Params<"tid">) => {
  const { tid } = await params;
  const p = await one<{ project_id: string }>("SELECT project_id FROM sop_tests WHERE id = $1", [tid]);
  if (!p) return notFound();
  const t = (await listTests(p.project_id)).find((x) => x.id === tid)!;
  return json(await testResults(p.project_id, t));
});
