const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(v: unknown): string {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  return EMAIL.test(e) ? e.slice(0, 200) : "";
}
