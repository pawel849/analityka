import { one } from "@/lib/db";
import { insertEvents, rememberIdentity, visitorForEmail } from "@/lib/collect";
import { parseHook } from "@/lib/webhook";

/**
 * Webhook projektu: POST /api/hooks/{sekret}?type=lead|purchase&value=…
 * Adres zawiera tajny klucz projektu (inny niż publiczny klucz skryptu).
 */
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const project = await one<{ id: string }>("SELECT id FROM projects WHERE webhook_secret = $1", [secret]);
  if (!project) return Response.json({ error: "Nieznany webhook" }, { status: 404 });

  const text = await req.text();
  if (text.length > 200_000) return Response.json({ error: "Za duże dane" }, { status: 413 });
  let body: unknown = {};
  const ct = req.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(text)) : text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "Niepoprawny JSON" }, { status: 400 });
  }
  const ev = parseHook(body, new URL(req.url).searchParams);
  if (!ev) return Response.json({ ok: true, ignored: true });

  let visitor = ev.visitorId;
  if (!visitor && ev.email) visitor = (await visitorForEmail(project.id, ev.email)) ?? "";
  if (!visitor && ev.email) visitor = `mail:${ev.email}`;
  if (!visitor) return Response.json({ error: "Brak e-maila lub visitor_id – nie da się przypisać osoby" }, { status: 422 });
  if (ev.email && !visitor.startsWith("mail:")) await rememberIdentity(project.id, ev.email, visitor);

  await insertEvents(project.id, [
    {
      type: ev.type,
      name: ev.name,
      visitor_id: visitor,
      session_id: "",
      url: "",
      path: "",
      referrer: "",
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_content: "",
      utm_term: "",
      element: "",
      value: ev.value,
      scroll: null,
      email: ev.email,
      origin: "webhook",
    },
  ]);
  return Response.json({ ok: true, type: ev.type, matched: !visitor.startsWith("mail:") });
}
