import { guarded, json, type Params } from "@/lib/api";
import { economicsReport } from "@/lib/economics-report";

/** Ekonomia jednostkowa projektu: miesiące + okresy z ustawień (lub cały zakres danych). */
export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const url = new URL(req.url);
  try {
    return json(await economicsReport(id, url.searchParams.get("from"), url.searchParams.get("to")));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
