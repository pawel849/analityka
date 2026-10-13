import { one, q } from "./db";

const keyCache = new Map<string, string | null>();

export async function projectIdForKey(key: string): Promise<string | null> {
  if (keyCache.has(key)) return keyCache.get(key)!;
  const row = await one<{ id: string }>("SELECT id FROM projects WHERE tracking_key = $1", [key]);
  const id = row?.id ?? null;
  if (id) keyCache.set(key, id);
  return id;
}

export function forgetProjectKey(key: string) {
  keyCache.delete(key);
}

export const ALLOWED_TYPES = new Set([
  "pageview",
  "click",
  "scroll",
  "lead",
  "form_submit",
  "purchase",
  "add_to_cart",
  "video_play",
  "booking",
  "custom",
  "identify",
]);

export interface IncomingEvent {
  t?: string; // type
  n?: string; // name
  v?: string; // visitor id
  s?: string; // session id
  u?: string; // url
  r?: string; // referrer (zewnętrzny, z początku sesji)
  us?: string;
  um?: string;
  uc?: string;
  uco?: string;
  ut?: string;
  e?: string; // element (tekst / id / href)
  val?: number;
  sc?: number; // scroll %
}

const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");

export interface CleanEvent {
  type: string;
  name: string;
  visitor_id: string;
  session_id: string;
  url: string;
  path: string;
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  element: string;
  value: number | null;
  scroll: number | null;
  country?: string;
  email?: string;
  origin?: string;
  ts?: Date;
}

export function clean(ev: IncomingEvent): CleanEvent | null {
  const type = str(ev.t, 32);
  const visitor = str(ev.v, 64);
  if (!ALLOWED_TYPES.has(type) || !visitor) return null;
  const url = str(ev.u, 1000);
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    /* zostaje "/" */
  }
  const value = typeof ev.val === "number" && Number.isFinite(ev.val) ? ev.val : null;
  const scroll = typeof ev.sc === "number" && Number.isFinite(ev.sc) ? Math.max(0, Math.min(100, Math.round(ev.sc))) : null;
  return {
    type,
    name: str(ev.n, 200),
    visitor_id: visitor,
    session_id: str(ev.s, 64),
    url,
    path: path.slice(0, 500),
    referrer: str(ev.r, 1000),
    utm_source: str(ev.us, 200).toLowerCase(),
    utm_medium: str(ev.um, 200).toLowerCase(),
    utm_campaign: str(ev.uc, 200),
    utm_content: str(ev.uco, 200),
    utm_term: str(ev.ut, 200),
    element: str(ev.e, 300),
    value,
    scroll,
  };
}

export async function insertEvents(projectId: string, events: CleanEvent[], isTest = false) {
  if (!events.length) return;
  const cols = 20;
  const chunk = 500;
  for (let i = 0; i < events.length; i += chunk) {
    const part = events.slice(i, i + chunk);
    const values: unknown[] = [];
    const rows = part.map((e, j) => {
      values.push(
        projectId,
        e.ts ?? new Date(),
        e.type,
        e.name,
        e.visitor_id,
        e.session_id,
        e.url,
        e.path,
        e.referrer,
        e.utm_source,
        e.utm_medium,
        e.utm_campaign,
        e.utm_content,
        e.utm_term,
        e.element,
        e.value,
        e.scroll,
        (e.country ?? "").slice(0, 2).toUpperCase(),
        (e.email ?? "").slice(0, 200).toLowerCase(),
        e.origin ?? "script",
      );
      const b = j * (cols + 0);
      return `(${Array.from({ length: cols }, (_, k) => `$${b + k + 1}`).join(",")}, ${isTest ? "true" : "false"})`;
    });
    await q(
      `INSERT INTO events (project_id, ts, type, name, visitor_id, session_id, url, path, referrer,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, element, value, scroll, country, email, origin, is_test)
       VALUES ${rows.join(",")}`,
      values,
    );
  }
}

export { normalizeEmail } from "./email";

/** Zapamiętuje powiązanie e-mail → osoba (do łączenia zakupów i leadów z webhooków). */
export async function rememberIdentity(projectId: string, email: string, visitorId: string) {
  if (!email || !visitorId) return;
  await q(
    `INSERT INTO identities (project_id, email, visitor_id) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, email) DO UPDATE SET visitor_id = EXCLUDED.visitor_id, updated_at = now()`,
    [projectId, email, visitorId],
  );
}

export async function visitorForEmail(projectId: string, email: string): Promise<string | null> {
  const row = await one<{ visitor_id: string }>("SELECT visitor_id FROM identities WHERE project_id = $1 AND email = $2", [projectId, email]);
  return row?.visitor_id ?? null;
}
