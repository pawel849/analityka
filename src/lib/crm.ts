// CRM Pawła w Google Sheets: dopisywanie prospektów z dedupe po mailu/nazwie, kolumny B–J (A pusta).
import { appendRows, readRange, updateRange } from "./google-sheets";

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

/** Komórki telefonu zapisane jako formuła („+48 …” → #ERROR!): odczytuje formułę, zapisuje z powrotem jako tekst. */
export async function repairPhoneCells() {
  const col = `${CRM_SHEET_NAME}!E3:E`;
  const [shown, formulas] = await Promise.all([readRange(CRM_SHEET_ID, col), readRange(CRM_SHEET_ID, col, "FORMULA")]);
  const fixes: { row: number; from: string; to: string }[] = [];
  for (let i = 0; i < Math.max(shown.length, formulas.length); i++) {
    const v = shown[i]?.[0] ?? "";
    const f = formulas[i]?.[0] ?? "";
    if (!/^#(ERROR|NAME|VALUE|REF|N\/A)!?/.test(v) || !f.trim()) continue;
    // Formuła może mieć postać „=+48 601…”, „+48 601…” albo „=48601…” – zostawiamy same cyfry i formatujemy.
    const digits = f.replace(/\D/g, "");
    const local = digits.length === 11 && digits.startsWith("48") ? digits.slice(2) : digits.length === 9 ? digits : null;
    const text = local ? `+48 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : f.replace(/^=/, "").replace(/\s+/g, " ").trim();
    fixes.push({ row: i + 3, from: f, to: text });
  }
  for (const x of fixes) await updateRange(CRM_SHEET_ID, `${CRM_SHEET_NAME}!E${x.row}`, [[x.to]]);
  return { repaired: fixes.length, fixes };
}
