// CRM Pawła w Google Sheets: dopisywanie prospektów z dedupe po mailu/nazwie, kolumny B–J (A pusta).
import { appendRows, readRange } from "./google-sheets";

export const CRM_SHEET_ID = process.env.CRM_SHEET_ID || "1_V6VKmM8gjV4Vhl4TqrZLpfseh2KKWY8QyX5uKwd4Cw";
export const CRM_SHEET_NAME = process.env.CRM_SHEET_NAME || "Arkusz1";

export type CrmRow = {
  imie: string; // „Imię Nazwisko (Marka)”
  branza: string; // 1–2 zdania kto to + sygnały (reklamy, liczniki)
  email?: string;
  telefon?: string;
  ig?: string;
  screenshoty?: string;
  porady?: string[]; // do 3
};

const norm = (s: string) => s.trim().toLowerCase();

export async function appendToCrm(rows: CrmRow[]) {
  const existing = await readRange(CRM_SHEET_ID, `${CRM_SHEET_NAME}!B3:D`);
  const names = new Set(existing.map((r) => norm(r[0] ?? "")).filter(Boolean));
  const emails = new Set(existing.map((r) => norm(r[2] ?? "")).filter(Boolean));
  const skipped: { imie: string; why: string }[] = [];
  const fresh = rows.filter((r) => {
    if (r.email && emails.has(norm(r.email))) return skipped.push({ imie: r.imie, why: `mail już w CRM: ${r.email}` }), false;
    if (names.has(norm(r.imie))) return skipped.push({ imie: r.imie, why: "nazwa już w CRM" }), false;
    return true;
  });
  const values = fresh.map((r) => ["", r.imie, r.branza, r.email ?? "", r.telefon ?? "", r.ig ?? "", r.screenshoty ?? "", ...(r.porady ?? []).slice(0, 3)]);
  const res = values.length ? await appendRows(CRM_SHEET_ID, CRM_SHEET_NAME, values) : { updatedRange: "", updatedRows: 0 };
  return { added: res.updatedRows, range: res.updatedRange, skipped, existing_rows: existing.length };
}
