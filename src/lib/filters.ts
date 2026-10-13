import type { NodeFilter } from "./catalog";

/** Filtry analizy z parametru ?f= (JSON). */
export function parseFilters(raw: string | null): NodeFilter[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.slice(0, 10).map((f) => ({ key: String(f.key ?? ""), op: f.op ?? "eq", value: String(f.value ?? "") }))
      : [];
  } catch {
    return [];
  }
}
