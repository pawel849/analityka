import { guarded, json, type Params } from "@/lib/api";
import { economicsReport } from "@/lib/economics-report";

const compareParam = (v: string | null) => (v === "poprzedni" || v === "ustawienia" ? v : null);

/** Ekonomia jednostkowa projektu: miesiące + okresy z ustawień (lub cały zakres danych). */
export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const url = new URL(req.url);
  try {
    return json(await economicsReport(id, url.searchParams.get("from"), url.searchParams.get("to"), { campaigns: url.searchParams.get("campaigns"), products: url.searchParams.get("products") }, compareParam(url.searchParams.get("compare"))));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
