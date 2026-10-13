import { clean, insertEvents, normalizeEmail, projectIdForKey, rememberIdentity, type IncomingEvent } from "@/lib/collect";

// Publiczny endpoint skryptu śledzącego. Treść wysyłana jako text/plain (bez preflight CORS).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (text.length > 100_000) return new Response("too large", { status: 413, headers: CORS });
    const payload = JSON.parse(text) as { k?: string; ev?: IncomingEvent[] };
    const projectId = payload.k ? await projectIdForKey(String(payload.k)) : null;
    if (!projectId) return new Response("unknown key", { status: 404, headers: CORS });
    // Kraj z nagłówka geolokalizacji Vercel (lokalnie brak).
    const country = req.headers.get("x-vercel-ip-country") ?? "";
    const events = (Array.isArray(payload.ev) ? payload.ev : [])
      .slice(0, 50)
      .map(clean)
      .filter((e) => e !== null)
      .map((e) => {
        if (e.type !== "identify") return { ...e, country };
        const email = normalizeEmail(e.name);
        return { ...e, name: "", email, country };
      });
    for (const e of events) if (e.type === "identify" && e.email) await rememberIdentity(projectId, e.email, e.visitor_id);
    await insertEvents(projectId, events);
    return new Response(null, { status: 204, headers: CORS });
  } catch (e) {
    console.error("collect", e);
    return new Response("bad request", { status: 400, headers: CORS });
  }
}
