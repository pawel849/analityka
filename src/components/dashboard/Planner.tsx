"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Clock, Copy, FlaskConical, Plus, Smartphone, Star, Trash2, X } from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { holidays } from "@/lib/holidays";
import type { PlanItem } from "@/lib/planner";

const DAY_MS = 86400_000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY_MS));
const diff = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS); // b − a w dniach
const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const DOW = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00–21:00
const TIMES = HOURS.flatMap((h) => [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`]);

/** Ile zostało do terminu – krótko. */
function left(due: string, today: string): { text: string; tone: "late" | "today" | "soon" | "ok" } {
  const n = diff(today, due);
  if (n < 0) return { text: `${-n} ${-n === 1 ? "dzień" : "dni"} po terminie`, tone: "late" };
  if (n === 0) return { text: "dziś", tone: "today" };
  if (n === 1) return { text: "jutro", tone: "soon" };
  return { text: `za ${n} dni`, tone: n <= 3 ? "soon" : "ok" };
}

function gridWeeks(month: Date): string[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const weeks: string[][] = [];
  for (let d = new Date(start); d <= last || weeks.length < 5; ) {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) {
      w.push(iso(d));
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    weeks.push(w);
    if (d > last && weeks.length >= 5) break;
  }
  return weeks;
}

interface Seg { it: PlanItem; col: number; span: number; lane: number; fill: number; isEnd: boolean }

/** Paski okresów w tygodniu: przycięte do tygodnia, ułożone w tory, z wypełnieniem do dziś. */
function weekSegments(week: string[], ranges: PlanItem[], today: string): { segs: Seg[]; lanes: number } {
  const ws = week[0], we = week[6];
  const segs: Seg[] = [];
  const laneEnd: number[] = [];
  const ordered = [...ranges].sort((x, y) => (x.start! < y.start! ? -1 : x.start! > y.start! ? 1 : y.date.localeCompare(x.date)));
  for (const it of ordered) {
    const s = it.start! > ws ? it.start! : ws;
    const e = it.date < we ? it.date : we;
    if (s > e) continue;
    const col = diff(ws, s);
    const span = diff(s, e) + 1;
    let lane = laneEnd.findIndex((end) => end < col);
    if (lane < 0) lane = laneEnd.length;
    laneEnd[lane] = col + span - 1;
    const fill = today < s ? 0 : today > e ? 1 : (diff(s, today) + 1) / span;
    segs.push({ it, col, span, lane, fill, isEnd: e === it.date });
  }
  return { segs, lanes: laneEnd.length };
}

export function Planner({ projectId }: { projectId: string }) {
  const today = iso(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sel, setSel] = useState<string | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [err, setErr] = useState("");
  const [ics, setIcs] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [quick, setQuick] = useState("");
  const weeks = useMemo(() => gridWeeks(month), [month]);
  const from = weeks[0][0] < addDays(today, -30) ? weeks[0][0] : addDays(today, -30);
  const lastDay = weeks[weeks.length - 1][6];
  const to = lastDay > addDays(today, 30) ? lastDay : addDays(today, 30);
  const load = useCallback(
    () => api<PlanItem[]>(`/api/projects/${projectId}/tasks?from=${from}&to=${to}`).then(setItems).catch((e) => setErr(e.message)),
    [projectId, from, to],
  );
  useEffect(() => {
    load();
  }, [load]);
  const hol = useMemo(() => {
    const m = new Map<string, string>();
    for (const y of new Set(weeks.flat().map((d) => Number(d.slice(0, 4))))) for (const [k, v] of holidays(y)) m.set(k, v);
    return m;
  }, [weeks]);

  const ranges = items.filter((i) => i.start);
  const singles = items.filter((i) => !i.start);
  const byDay = new Map<string, PlanItem[]>();
  for (const it of singles) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);
  for (const list of byDay.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  const todayList = [...(byDay.get(today) ?? []), ...ranges.filter((r) => r.start! <= today && r.date >= today)];
  const deadlines = items
    .filter((i) => !i.done && (i.date >= today ? diff(today, i.date) <= 21 : i.kind === "task"))
    .filter((i) => i.start || i.date !== today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const toggle = async (i: PlanItem) => {
    if (i.kind !== "task") return;
    await api(`/api/tasks/${i.id}`, "PATCH", { done: !i.done });
    load();
  };
  const remove = async (i: PlanItem) => {
    await api(`/api/tasks/${i.id}`, "DELETE");
    load();
  };
  const addQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quick.trim()) return;
    await api(`/api/projects/${projectId}/tasks`, "POST", { title: quick, due: today });
    setQuick("");
    load();
  };
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="pl2">
      <div className="pl2-top">
        <section className="pl2-card">
          <div className="pl2-card-head">
            <b>Dziś</b>
            <span>{parse(today).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</span>
            {hol.get(today) && <span className="hol-chip"><Star size={12} /> {hol.get(today)}</span>}
          </div>
          <ul className="pl2-list">
            {todayList.map((i) => (
              <ItemRow key={i.id} i={i} today={today} onToggle={toggle} onRemove={remove} />
            ))}
            {!todayList.length && <li className="pl2-empty">Nic na dziś</li>}
          </ul>
          <form className="pl2-quick" onSubmit={addQuick}>
            <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Dodaj na dziś…" aria-label="Dodaj zadanie na dziś" />
            <button className="btn primary" disabled={!quick.trim()} aria-label="Dodaj"><Plus size={16} /></button>
          </form>
        </section>
        <section className="pl2-card">
          <div className="pl2-card-head">
            <b>Terminy</b>
            <span>najbliższe 3 tygodnie</span>
          </div>
          <ul className="pl2-list">
            {deadlines.map((i) => {
              const l = left(i.date, today);
              const total = i.start ? diff(i.start, i.date) + 1 : 0;
              const done = i.start ? Math.min(total, Math.max(0, diff(i.start, today) + 1)) : 0;
              return (
                <li key={i.id} className={`dl t-${l.tone}`} onClick={() => setSel(i.date)}>
                  <span className="dl-ic">{i.kind === "round" ? <FlaskConical size={15} /> : <CalendarClock size={15} />}</span>
                  <span className="dl-main">
                    <span className="dl-title">{i.title}</span>
                    {i.start && (
                      <span className="dl-bar" title={`${done} z ${total} dni`}>
                        <i style={{ width: `${(done / total) * 100}%` }} />
                      </span>
                    )}
                  </span>
                  <span className={`dl-left t-${l.tone}`}>{l.text}</span>
                </li>
              );
            })}
            {!deadlines.length && <li className="pl2-empty">Brak terminów</li>}
          </ul>
        </section>
      </div>

      <section className="pl2-card pl2-cal">
        <div className="pl2-cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Poprzedni miesiąc"><ChevronLeft size={18} /></button>
          <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Następny miesiąc"><ChevronRight size={18} /></button>
          <span className="pl2-legend">
            <span><i className="lg-bar" /> okres do terminu</span>
            <span><i className="lg-we" /> weekend</span>
            <span><Star size={12} className="lg-hol" /> święto</span>
          </span>
        </div>
        <div className="pl2-dow">
          {DOW.map((d, i) => <span key={d} className={i >= 5 ? "we" : ""}>{d}</span>)}
        </div>
        {weeks.map((w) => {
          const { segs, lanes } = weekSegments(w, ranges, today);
          return (
            <div key={w[0]} className="pl2-week" style={{ ["--lanes" as string]: lanes }}>
              {w.map((d, i) => {
                const list = byDay.get(d) ?? [];
                const h = hol.get(d);
                const out = parse(d).getMonth() !== month.getMonth();
                return (
                  <button
                    key={d}
                    className={`pl2-day ${i >= 5 ? "we" : ""} ${h ? "hol" : ""} ${out ? "out" : ""} ${d === today ? "today" : ""} ${d === sel ? "sel" : ""}`}
                    onClick={() => setSel(d)}
                  >
                    <span className="pl2-dnum">
                      <span className="n">{Number(d.slice(8))}</span>
                      {h && <span className="hol-name" title={h}><Star size={11} /> {h}</span>}
                    </span>
                    {list.slice(0, 3).map((it) => (
                      <span key={it.id} className={`pl2-chip ${it.done ? "done" : ""} ${it.kind === "round" ? "k-round" : ""} ${!it.done && it.date < today ? "late" : ""}`}>
                        {it.time && <em>{it.time}</em>}
                        {it.title}
                      </span>
                    ))}
                    {list.length > 3 && <span className="pl2-more">+{list.length - 3}</span>}
                  </button>
                );
              })}
              {segs.map((s) => {
                const l = left(s.it.date, today);
                return (
                  <button
                    key={s.it.id + s.col}
                    className={`pl2-bar k-${s.it.kind} ${s.it.done ? "done" : ""} ${!s.it.done && s.it.date < today ? "late" : ""}`}
                    style={{ left: `calc(${(s.col / 7) * 100}% + 4px)`, width: `calc(${(s.span / 7) * 100}% - 8px)`, bottom: `${6 + s.lane * 24}px` }}
                    onClick={() => setSel(s.it.date)}
                    title={`${s.it.title} · termin ${s.it.date} · ${l.text}`}
                  >
                    <i style={{ width: `${s.fill * 100}%` }} />
                    <span className="pl2-bar-t">{s.it.title}</span>
                    {s.isEnd && <span className="pl2-bar-l">{s.it.done ? "✓" : l.text}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
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
        {err && <p className="error">{err}</p>}
      </section>

      {sel && (
        <DayPanel
          projectId={projectId}
          day={sel}
          today={today}
          holiday={hol.get(sel)}
          singles={byDay.get(sel) ?? []}
          ranges={ranges.filter((r) => r.start! <= sel && r.date >= sel)}
          onClose={() => setSel(null)}
          onChanged={load}
          onToggle={toggle}
          onRemove={remove}
        />
      )}
    </div>
  );
}

function ItemRow({ i, today, onToggle, onRemove }: { i: PlanItem; today: string; onToggle: (i: PlanItem) => void; onRemove: (i: PlanItem) => void }) {
  const l = i.start ? left(i.date, today) : null;
  return (
    <li className={`pl2-item ${i.done ? "done" : ""}`}>
      {i.kind === "task" ? (
        <input type="checkbox" checked={i.done} onChange={() => onToggle(i)} aria-label="Zrobione" />
      ) : (
        <span className="dl-ic"><FlaskConical size={15} /></span>
      )}
      {i.time && <em className="pl2-time">{i.time}</em>}
      <span className="pl2-title">{i.link ? <Link href={i.link}>{i.title}</Link> : i.title}</span>
      {l && <span className={`dl-left t-${l.tone}`}>{l.text}</span>}
      {i.kind === "task" && (
        <button className="icon-btn danger" aria-label="Usuń" onClick={() => onRemove(i)}><Trash2 size={14} /></button>
      )}
    </li>
  );
}

/** Panel dnia (wysuwany po kliknięciu): okresy trwające, cały dzień, godziny 7–21, dodawanie. */
function DayPanel({
  projectId, day, today, holiday, singles, ranges, onClose, onChanged, onToggle, onRemove,
}: {
  projectId: string; day: string; today: string; holiday?: string; singles: PlanItem[]; ranges: PlanItem[];
  onClose: () => void; onChanged: () => void; onToggle: (i: PlanItem) => void; onRemove: (i: PlanItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [period, setPeriod] = useState(false);
  const [start, setStart] = useState(addDays(day, -7) < today ? today : addDays(day, -7));
  const [err, setErr] = useState("");
  const allDay = singles.filter((i) => !i.time);
  const timed = singles.filter((i) => i.time);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setErr("");
    try {
      await api(`/api/projects/${projectId}/tasks`, "POST", { title, due: day, time: period ? null : time || null, start: period ? start : null });
      setTitle("");
      setTime("");
      onChanged();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="pl2-panel-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="pl2-panel" role="dialog" aria-label="Dzień">
        <div className="pl2-panel-head">
          <div>
            <b>{parse(day).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</b>
            {holiday && <span className="hol-chip"><Star size={12} /> {holiday}</span>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Zamknij"><X size={18} /></button>
        </div>

        {ranges.length > 0 && (
          <div className="pl2-sec">
            <span className="pl2-sec-t">Trwa / termin</span>
            <ul className="pl2-list">
              {ranges.map((i) => <ItemRow key={i.id} i={i} today={today} onToggle={onToggle} onRemove={onRemove} />)}
            </ul>
          </div>
        )}
        <div className="pl2-sec">
          <span className="pl2-sec-t">Cały dzień</span>
          <ul className="pl2-list">
            {allDay.map((i) => <ItemRow key={i.id} i={i} today={today} onToggle={onToggle} onRemove={onRemove} />)}
            {!allDay.length && <li className="pl2-empty">—</li>}
          </ul>
        </div>
        <div className="pl2-sec">
          <span className="pl2-sec-t">Godziny</span>
          <div className="pl2-hours">
            {HOURS.map((h) => {
              const hh = String(h).padStart(2, "0");
              const at = timed.filter((i) => i.time!.slice(0, 2) === hh);
              return (
                <div key={h} className="pl2-hour">
                  <button className="pl2-hour-l" onClick={() => { setPeriod(false); setTime(`${hh}:00`); }} title={`Dodaj o ${hh}:00`}>{hh}:00</button>
                  <div className="pl2-hour-items">
                    {at.map((i) => <ItemRow key={i.id} i={i} today={today} onToggle={onToggle} onRemove={onRemove} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form className="pl2-add" onSubmit={add}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Co zrobić?" aria-label="Nowe zadanie" autoFocus />
          <div className="seg" role="group" aria-label="Rodzaj">
            <button type="button" className={!period ? "on" : ""} onClick={() => setPeriod(false)}><Clock size={14} /> w tym dniu</button>
            <button type="button" className={period ? "on" : ""} onClick={() => setPeriod(true)}><CalendarClock size={14} /> termin z okresem</button>
          </div>
          {period ? (
            <label className="pl2-f">od <input type="date" value={start} max={addDays(day, -1)} onChange={(e) => setStart(e.target.value)} /> do <b>{day}</b></label>
          ) : (
            <label className="pl2-f">godzina
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                <option value="">cały dzień</option>
                {TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          )}
          <button className="btn primary" disabled={!title.trim()}><Plus size={16} /> Dodaj</button>
          {err && <p className="error">{err}</p>}
        </form>
      </aside>
    </div>
  );
}
