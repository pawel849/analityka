import { guarded, json, type Params } from "@/lib/api";
import { shareReport } from "@/lib/loop";

/** Link tylko do odczytu dla klienta. */
export const POST = guarded(async (_req, { params }: Params<"lid">) => {
  try {
    return json({ token: await shareReport((await params).lid) });
  } catch (e) {
    return json({ error: (e as Error).message }, 404);
  }
});
