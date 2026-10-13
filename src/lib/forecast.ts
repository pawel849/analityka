import type { NodeData } from "./catalog";

const PERIOD_DAYS = { day: 1, week: 7, month: 365.25 / 12 };

/** Prognozowana liczba osób w zakresie dat (włącznie z obiema datami). */
export function forecastForRange(f: NodeData["forecast"], from: string, to: string): number | null {
  if (!f || !(f.people > 0)) return null;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000) + 1;
  if (!(days > 0)) return null;
  return (f.people / PERIOD_DAYS[f.period]) * days;
}

/** Poprzedni okres o tej samej długości, kończący się dzień przed `from`. */
export function previousRange(from: string, to: string): [string, string] {
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  const len = Math.round((t - f) / 86400_000) + 1;
  const prevTo = f - 86400_000;
  const prevFrom = prevTo - (len - 1) * 86400_000;
  const d = (x: number) => new Date(x).toISOString().slice(0, 10);
  return [d(prevFrom), d(prevTo)];
}

/** Zmiana względna (np. 0.12 = +12%), null gdy brak bazy. */
export function delta(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}
