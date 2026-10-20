import { guarded, json, type Params } from "@/lib/api";
import { sessionRange } from "@/lib/loop";
import { reality } from "@/lib/loop-data";

export const dynamic = "force-dynamic";
/** Wynik w okresie sesji (koniec okresu = koniec wykresów). */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const range = await sessionRange(id);
  return json(await reality(id, range.to, range));
});
