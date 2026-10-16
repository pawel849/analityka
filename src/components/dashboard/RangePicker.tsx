"use client";

import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

const DAY = 86400_000;
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface RangePreset {
  label: string;
  from: string;
  to: string;
}

export const lastDays = (n: number): RangePreset => ({ label: `${n} dni`, from: isoDay(Date.now() - (n - 1) * DAY), to: isoDay(Date.now()) });

/** Wybór okresu: szybkie przyciski + dwa pola daty. Bez `onPick` zmienia ?from=&to= w adresie strony. */
export function RangePicker({
  from, to, presets = [7, 14, 30, 90].map(lastDays), onPick, active,
}: {
  from: string;
  to: string;
  presets?: RangePreset[];
  onPick?: (from: string, to: string) => void;
  /** Wymuszenie podświetlenia (np. przycisk spoza listy dat). */
  active?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const go = onPick ?? ((f: string, t: string) => router.push(`${pathname}?from=${f}&to=${t}`));
  const today = isoDay(Date.now());
  const on = active !== undefined ? active : presets.find((p) => p.from === from && p.to === to)?.label;
  return (
    <div className="range-picker">
      <div className="range-presets" role="group" aria-label="Szybki wybór okresu">
        {presets.map((p) => (
          <button key={p.label} className={on === p.label ? "on" : ""} onClick={() => go(p.from, p.to)}>
            {p.label}
          </button>
        ))}
      </div>
      <label className="range-dates">
        <CalendarDays size={16} />
        <input type="date" value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, to)} aria-label="Od" />
        <span>–</span>
        <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && go(from, e.target.value)} aria-label="Do" />
      </label>
    </div>
  );
}
