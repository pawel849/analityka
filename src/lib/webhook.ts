// Normalizacja danych z webhooków (Zapier, Make, Pabbly, Stripe, MailerLite, GetResponse, własne).
import { normalizeEmail } from "./email.ts";

export interface HookEvent {
  type: string;
  email: string;
  visitorId: string;
  value: number | null;
  name: string;
}

const TYPES = new Set(["lead", "purchase", "form_submit", "booking", "add_to_cart", "custom"]);

/** Szuka pierwszego pola „email” w dowolnie zagnieżdżonym obiekcie. */
export function findEmail(obj: unknown, depth = 0): string {
  if (!obj || typeof obj !== "object" || depth > 6) return "";
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/e-?mail/i.test(k)) {
      const e = normalizeEmail(v);
      if (e) return e;
    }
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const e = findEmail(v, depth + 1);
    if (e) return e;
  }
  return "";
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Zamienia treść webhooka na zdarzenie. Kolejność:
 *  1) Stripe (pole "type" w stylu "checkout.session.completed") – kwoty w groszach dzielone przez 100,
 *  2) parametry adresu (?type=lead&value=297),
 *  3) pola treści: type / event, value / amount / total / price, email (gdziekolwiek), visitor_id, name.
 */
export function parseHook(body: unknown, params: URLSearchParams): HookEvent | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const stripeType = typeof b.type === "string" && b.type.includes(".") ? b.type : "";
  if (stripeType) {
    const obj = ((b.data as Record<string, unknown>)?.object ?? {}) as Record<string, unknown>;
    const paid = ["checkout.session.completed", "payment_intent.succeeded", "charge.succeeded", "invoice.paid"];
    if (!paid.includes(stripeType)) return null;
    const cents = num(obj.amount_total ?? obj.amount_received ?? obj.amount ?? obj.amount_paid);
    return {
      type: "purchase",
      email: findEmail(obj),
      visitorId: String((obj.metadata as Record<string, unknown>)?.anl_vid ?? obj.client_reference_id ?? ""),
      value: cents == null ? null : cents / 100,
      name: String(obj.description ?? stripeType),
    };
  }
  const rawType = String(params.get("type") ?? b.type ?? b.event ?? "lead").toLowerCase();
  const type = TYPES.has(rawType) ? rawType : "custom";
  return {
    type,
    email: findEmail(b) || normalizeEmail(params.get("email")),
    visitorId: String(b.visitor_id ?? b.anl_vid ?? params.get("visitor_id") ?? ""),
    value: num(params.get("value") ?? b.value ?? b.amount ?? b.total ?? b.price),
    name: String(params.get("name") ?? b.name ?? (type === "custom" ? rawType : "")).slice(0, 200),
  };
}
