import { body, guarded, json, type Params } from "@/lib/api";
import { q } from "@/lib/db";
import { updateTest } from "@/lib/loop";

export const PATCH = guarded(async (req, { params }: Params<"tid">) => {
  const { tid } = await params;
  try {
    await updateTest(tid, await body(req));
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

export const DELETE = guarded(async (_req, { params }: Params<"tid">) => {
  const { tid } = await params;
  await q("DELETE FROM tasks WHERE test_id = $1", [tid]);
  await q("DELETE FROM timeline_events WHERE link = $1", [`test:${tid}`]);
  await q("DELETE FROM sop_tests WHERE id = $1", [tid]);
  return json({ ok: true });
});
