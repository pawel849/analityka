import { seal } from "../secret-box";
import { META_DEFAULT_VERSION, normalizeAccountId } from "./meta";
import { WOO_DEFAULT_PAID, normalizeSiteUrl } from "./woo";

export interface IntegrationInput {
  provider?: string;
  name?: string;
  // Meta
  accountId?: string;
  token?: string;
  version?: string;
  // WooCommerce
  site?: string;
  key?: string;
  secret?: string;
  paidStatuses?: string;
  events?: boolean;
  // wspólne
  days?: number;
  enabled?: boolean;
}

/** Zamienia dane z formularza na konfigurację + zaszyfrowany klucz (puste klucze = bez zmian przy edycji). */
export function buildConfig(provider: string, b: IntegrationInput, prev?: Record<string, unknown>) {
  const days = Math.min(Math.max(Math.round(Number(b.days ?? prev?.days ?? 90)) || 90, 1), 1095);
  if (provider === "meta") {
    const accountId = normalizeAccountId(String(b.accountId ?? prev?.accountId ?? ""));
    const version = String(b.version || prev?.version || META_DEFAULT_VERSION).trim();
    if (!/^v\d+\.\d+$/.test(version)) throw new Error("Wersja API w formacie np. v26.0");
    const token = (b.token ?? "").trim();
    return { config: { accountId, version, days }, secret: token ? seal(token) : null };
  }
  if (provider === "woocommerce") {
    const site = normalizeSiteUrl(String(b.site ?? prev?.site ?? ""));
    const paidStatuses = String(b.paidStatuses ?? prev?.paidStatuses ?? WOO_DEFAULT_PAID).trim() || WOO_DEFAULT_PAID;
    const events = b.events ?? (prev?.events as boolean | undefined) ?? true;
    const key = (b.key ?? "").trim();
    const secret = (b.secret ?? "").trim();
    if ((key && !secret) || (!key && secret)) throw new Error("Podaj oba klucze: Consumer key i Consumer secret.");
    return { config: { site, paidStatuses, events, days }, secret: key ? seal(`${key}\n${secret}`) : null };
  }
  throw new Error("Nieznany rodzaj integracji");
}

