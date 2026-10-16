"use client";

import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

const DAY = 86400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const PRESETS = [7, 14, 30, 90];

/** Wybór okresu pulpitu; porównanie liczy się z poprzednim okresem tej samej długości. */
export function RangePicker({ from, to, days }: { from: string; to: string; days: number }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const today = iso(Date.now());
  const go = (f: string, t: string) => router.push(`${pathname}?from=${f}&to=${t}`);
  const preset = to === today ? days : null;
  return (
    <div className="range-picker">
      <div className="range-presets" role="group" aria-label="Szybki wybór okresu">
        {PRESETS.map((n) => (
          <button key={n} className={preset === n ? "on" : ""} onClick={() => go(iso(Date.now() - (n - 1) * DAY), today)}>
            {n} dni
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
