// Klucze dostępu dla asystentów AI (serwer MCP). W bazie tylko skrót SHA-256 – pełny klucz widać raz, przy tworzeniu.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { newId, one, q } from "./db";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createAiKey(name: string): Promise<{ id: string; token: string }> {
  const token = `anl_${randomBytes(24).toString("hex")}`;
  const id = newId();
  await one("INSERT INTO ai_keys (id, name, token_hash, hint) VALUES ($1, $2, $3, $4) RETURNING id", [
    id, name.trim().slice(0, 100) || "Asystent AI", hash(token), `${token.slice(0, 8)}…${token.slice(-4)}`,
  ]);
  return { id, token };
}

export async function listAiKeys() {
  return q<{ id: string; name: string; hint: string; created_at: string; last_used_at: string | null }>(
    "SELECT id, name, hint, created_at, last_used_at FROM ai_keys ORDER BY created_at",
  );
}

export async function revokeAiKey(id: string) {
  return one("DELETE FROM ai_keys WHERE id = $1 RETURNING id", [id]);
}

/** Sprawdza klucz; zwraca id klucza albo null. */
export async function verifyAiKey(token: string | null | undefined): Promise<string | null> {
  if (!token || !/^anl_[0-9a-f]{48}$/.test(token)) return null;
  const h = hash(token);
  const row = await one<{ id: string; token_hash: string }>("SELECT id, token_hash FROM ai_keys WHERE token_hash = $1", [h]);
  if (!row || !timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(h))) return null;
  await q("UPDATE ai_keys SET last_used_at = now() WHERE id = $1", [row.id]);
  return row.id;
}
