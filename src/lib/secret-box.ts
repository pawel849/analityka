// Szyfrowanie kluczy integracji (AES-256-GCM). Klucz szyfrujący pochodzi z AUTH_SECRET (lub APP_PASSWORD, jak logowanie) –
// zmiana AUTH_SECRET = trzeba ponownie wpisać klucze API w integracjach.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const s = process.env.AUTH_SECRET || process.env.APP_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "local-dev-secret");
  if (!s) throw new Error("Brak AUTH_SECRET – nie można zaszyfrować kluczy integracji.");
  return createHash("sha256").update(`integrations:${s}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function unseal(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data == null) throw new Error("Niepoprawny zapis klucza");
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    throw new Error("Nie można odczytać klucza API (zmieniono AUTH_SECRET?) – wpisz klucz ponownie.");
  }
}
