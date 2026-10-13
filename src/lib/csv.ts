// Parser CSV bez zależności: cudzysłowy, nowe linie w polach, BOM, wykrywanie separatora (, ; tab).

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, 5000).split(/\r?\n/)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, countOutsideQuotes(firstLine, d)] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (!q && ch === d) n++;
  }
  return n;
}

export function parseCsv(input: string, delimiter?: string): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') {
      q = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows, delimiter: d };
}

/** Liczba z formatów „1 234,56”, „1,234.56”, „12,5%”, „PLN 99” → number lub null. */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[\s ]/g, "").replace(/[^\d,.\-]/g, "");
  if (!s || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // separator dziesiętny = ten, który występuje później
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = (s.match(/,/g) ?? []).length === 1 && decimals !== 3 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Data z formatów RRRR-MM-DD, DD.MM.RRRR, DD/MM/RRRR, MM/DD/RRRR (gdy dzień > 12), z godziną lub bez → ISO. */
export function parseDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return iso(+m[1], +m[2], +m[3], m[4], m[5], m[6]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let day = +m[1];
    let month = +m[2];
    if (month > 12 && day <= 12) [day, month] = [month, day];
    return iso(+m[3], month, day, m[4], m[5], m[6]);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function iso(y: number, mo: number, d: number, h?: string, mi?: string, se?: string): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, h ? +h : 0, mi ? +mi : 0, se ? +se : 0));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Klucz do porównań: małe litery, bez polskich znaków i nadmiarowych spacji (NFC → NFD). */
export function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
