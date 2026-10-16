import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { DECISIONS, type Decision } from "@/lib/ad-tests";
import { setDecision } from "@/lib/ad-tests-data";

export const dynamic = "force-dynamic";

/** Decyzja (zatwierdzenie podpowiedzi) albo poprawka wariantu (nazwa reklamy, budżet, opisy). */
export const PATCH = guarded(async (req, { params }: Params<"vid">) => {
  const { vid } = await params;
  const b = await body<{ decision?: string; note?: string; meta_ad_name?: string; daily_budget?: number; change_to?: string; idea_source?: string; hypothesis?: string }>(req);
  if (b.decision !== undefined) {
    if (!DECISIONS.includes(b.decision as Decision)) return json({ error: `Decyzja: ${DECISIONS.join(" / ")}` }, 400);
    try {
      await setDecision(vid, b.decision as Decision, b.note ?? "");
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }
  const row = await one(
    `UPDATE ad_test_variants SET meta_ad_name = COALESCE($2, meta_ad_name), daily_budget = COALESCE($3, daily_budget),
       change_to = COALESCE($4, change_to), idea_source = COALESCE($5, idea_source), hypothesis = COALESCE($6, hypothesis) WHERE id = $1 RETURNING id`,
    [vid, b.meta_ad_name?.trim() || null, typeof b.daily_budget === "number" ? b.daily_budget : null, b.change_to ?? null, b.idea_source ?? null, b.hypothesis ?? null],
  );
  return row ? json({ ok: true }) : notFound();
});
