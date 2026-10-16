"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, FlaskConical, Flag, Plus, Smartphone, Trash2 } from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import type { PlanItem } from "@/lib/planner";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

/** Siatka miesiąca od poniedziałku do niedzieli. */
function gridDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const KIND_ICON = { start: FlaskConical, verdict: Flag } as const;

/** Planer na pulpicie: własne zadania + terminy rund testów; subskrypcja w kalendarzu telefonu. */
export function Planner({ projectId }: { projectId: string }) {
  const today = iso(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sel, setSel] = useState(today);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [ics, setIcs] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const days = gridDays(month);
  const from = iso(days[0]);
  const to = iso(days[days.length - 1]);
  const load = useCallback(
    () => api<PlanItem[]>(`/api/projects/${projectId}/tasks?from=${from}&to=${to}`).then(setItems).catch((e) => setErr(e.message)),
    [projectId, from, to],
  );
  useEffect(() => {
    load();
  }, [load]);
  const byDay = new Map<string, PlanItem[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);
  const dayItems = byDay.get(sel) ?? [];
  const selDate = new Date(`${sel}T12:00:00`);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setErr("");
    try {
      await api(`/api/projects/${projectId}/tasks`, "POST", { title, due: sel });
      setTitle("");
      load();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const openToday = (byDay.get(today) ?? []).filter((i) => !i.done).length;

  return (
    <div className="planner">
      <div className="pl-cal">
        <div className="pl-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Poprzedni miesiąc"><ChevronLeft size={18} /></button>
          <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Następny miesiąc"><ChevronRight size={18} /></button>
          <button className="btn small" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSel(today); }}>Dziś{openToday ? ` · ${openToday}` : ""}</button>
        </div>
        <div className="pl-grid">
          {DAYS.map((d) => <span key={d} className="pl-dow">{d}</span>)}
          {days.map((d) => {
            const k = iso(d);
            const list = byDay.get(k) ?? [];
            const open = list.filter((i) => !i.done).length;
            return (
              <button
                key={k}
                className={`pl-day ${d.getMonth() !== month.getMonth() ? "out" : ""} ${k === today ? "today" : ""} ${k === sel ? "sel" : ""} ${k < today && open ? "late" : ""}`}
                onClick={() => setSel(k)}
              >
                <span className="pl-n">{d.getDate()}</span>
                <span className="pl-dots">
                  {list.slice(0, 4).map((i) => <i key={i.id} className={`k-${i.kind} ${i.done ? "done" : ""}`} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="pl-side">
        <div className="pl-side-head">
          <b>{selDate.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</b>
        </div>
        <ul className="pl-list">
          {dayItems.map((i) => {
            const Icon = i.kind === "task" ? null : KIND_ICON[i.kind];
            return (
              <li key={i.id} className={`${i.done ? "done" : ""} k-${i.kind}`}>
                {Icon ? (
                  <span className="pl-ic"><Icon size={15} /></span>
                ) : (
                  <input
                    type="checkbox"
                    checked={i.done}
                    aria-label="Zrobione"
                    onChange={async () => {
                      await api(`/api/tasks/${i.id}`, "PATCH", { done: !i.done });
                      load();
                    }}
                  />
                )}
                <span className="pl-title">{i.link ? <Link href={i.link}>{i.title}</Link> : i.title}</span>
                {i.kind === "task" && (
                  <button
                    className="icon-btn danger"
                    aria-label="Usuń zadanie"
                    onClick={async () => {
                      await api(`/api/tasks/${i.id}`, "DELETE");
                      load();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
          {!dayItems.length && <li className="pl-empty">Wolne</li>}
        </ul>
        <form className="pl-add" onSubmit={add}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Nowe zadanie" placeholder="Co zrobić?" />
          <button className="btn primary" disabled={!title.trim()} aria-label="Dodaj zadanie"><Plus size={16} /></button>
        </form>
        {err && <p className="error">{err}</p>}
        <div className="pl-phone">
          {ics ? (
            <div className="pl-ics">
              <span><Smartphone size={15} /> Adres kalendarza <Tip text="Google Kalendarz (komputer): Inne kalendarze → + → Z adresu URL → wklej. iPhone: Ustawienia → Kalendarz → Konta → Dodaj konto → Inne → Dodaj kalendarz subskrybowany. Kalendarz odświeża się sam (Google co kilka godzin). Adres jest tajny – nie udostępniaj go." /></span>
              <code className="wrap">{ics}</code>
              <button className="btn small" onClick={() => navigator.clipboard.writeText(ics).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
                <Copy size={14} /> {copied ? "Skopiowano" : "Kopiuj"}
              </button>
            </div>
          ) : (
            <button className="btn small" onClick={async () => setIcs((await api<{ url: string }>(`/api/projects/${projectId}/calendar`, "POST")).url)}>
              <CalendarPlus size={15} /> Dodaj do kalendarza w telefonie
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
