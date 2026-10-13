import type { NodeData } from "./catalog";

const PERIOD_DAYS = { day: 1, week: 7, month: 365.25 / 12 };

/** Prognozowana liczba osób w zakresie dat (włącznie z obiema datami). */
export function forecastForRange(f: NodeData["forecast"], from: string, to: string): number | null {
  if (!f || !(f.people > 0)) return null;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000) + 1;
  if (!(days > 0)) return null;
  return (f.people / PERIOD_DAYS[f.period]) * days;
}
