// Zapis do Google Sheets kontem usługi (GOOGLE_SA_KEY = pełny JSON klucza). JWT podpisany node:crypto – bez zależności.
import { createSign } from "node:crypto";

type SaKey = { client_email: string; private_key: string; token_uri?: string };

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
let cached: { token: string; exp: number } | null = null;

function loadKey(): SaKey {
  const raw = process.env.GOOGLE_SA_KEY;
  if (!raw) throw new Error("Brak GOOGLE_SA_KEY w zmiennych środowiskowych.");
  let k: SaKey;
  try {
    k = JSON.parse(raw) as SaKey;
  } catch {
    throw new Error("GOOGLE_SA_KEY nie jest poprawnym JSON-em (wklej całą zawartość pliku klucza).");
  }
  if (!k.client_email || !k.private_key) throw new Error("GOOGLE_SA_KEY nie zawiera client_email / private_key.");
  return k;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const k = loadKey();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: k.client_email, scope: SCOPE, aud: k.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(k.private_key.replace(/\\n/g, "\n")))}`;
  const res = await fetch(k.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google OAuth: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim());
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

/** Dopisuje wiersze na końcu arkusza. RAW – żeby „+48 …” nie stało się formułą (#ERROR!). */
export async function appendRows(spreadsheetId: string, sheet: string, rows: (string | number | null)[][]): Promise<{ updatedRange: string; updatedRows: number }> {
  if (!rows.length) return { updatedRange: "", updatedRows: 0 };
  const token = await accessToken();
  const range = encodeURIComponent(`${sheet}!A:Z`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ majorDimension: "ROWS", values: rows.map((r) => r.map((v) => (v == null ? "" : v))) }),
  });
  const json = (await res.json()) as { updates?: { updatedRange?: string; updatedRows?: number }; error?: { message?: string; status?: string } };
  if (!res.ok) throw new Error(`Sheets API: ${json.error?.status ?? res.status} ${json.error?.message ?? ""}`.trim());
  return { updatedRange: json.updates?.updatedRange ?? "", updatedRows: json.updates?.updatedRows ?? rows.length };
}

/** Nadpisuje zakres (RAW). */
export async function updateRange(spreadsheetId: string, range: string, rows: (string | number | null)[][]): Promise<number> {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ majorDimension: "ROWS", values: rows.map((r) => r.map((v) => (v == null ? "" : v))) }),
  });
  const json = (await res.json()) as { updatedCells?: number; error?: { message?: string; status?: string } };
  if (!res.ok) throw new Error(`Sheets API: ${json.error?.status ?? res.status} ${json.error?.message ?? ""}`.trim());
  return json.updatedCells ?? 0;
}

/** Odczyt zakresu – do sprawdzenia duplikatów po nazwie/domenie przed dopisaniem. */
export async function readRange(spreadsheetId: string, range: string, render: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE"): Promise<string[][]> {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=${render}`, { headers: { authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { values?: string[][]; error?: { message?: string; status?: string } };
  if (!res.ok) throw new Error(`Sheets API: ${json.error?.status ?? res.status} ${json.error?.message ?? ""}`.trim());
  return json.values ?? [];
}
