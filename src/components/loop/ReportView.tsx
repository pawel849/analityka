"use client";

import { Fragment, useState } from "react";
import { ChevronDown, CircleCheck, ExternalLink, Map as MapIcon, Workflow, Eye, Flag, Gift, Globe, Mail, MailOpen, Megaphone, MessageCircleQuestion, MousePointerClick, Send, ShoppingCart, Sparkles, Target, Trophy, Users, Wallet } from "lucide-react";
import { CAT, LEVER_NAMES, type CatKey } from "@/lib/loop-def";
import { improve, type MetricKey } from "@/lib/levers";
import { allLevers, categories, type AnyLever } from "@/lib/money-map";
import type { ReportData } from "@/lib/loop";
import { DecisionCard, Deadline } from "./Decisions";
import { DataGaps, dayLabel, fm, GoalChart, PaceBars, pct, ProfitBars, range, RichText, zl, zlSigned, type GoalGap } from "./ui";

const STAGE: Record<string, string> = { cpm: "Wyświetlenia (CPM)", ctr: "Kliknięcia (CTR)", cr: "Zakupy po kliknięciu (CR)", aov: "Koszyk (AOV)", "żaden": "Żaden" };
export const stageName = (k: string | null | undefined) => (k == null ? "za mało danych" : STAGE[k] ?? k);

const STAGE_ICON: Record<string, typeof Eye> = { cpm: Eye, ctr: MousePointerClick, cr: ShoppingCart, aov: Wallet, "żaden": CircleCheck };

/** Predykcja vs dane: jedna skala z dwoma znacznikami + etap zdaniem. */
export function PredictionVs({ p }: { p: NonNullable<ReportData["prediction"]> }) {
  const a = p.profit_guess, b = p.profit_actual;
  const vals = [a, b ?? a, 0];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || 1;
  const pos = (v: number) => `${((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100}%`;
  const hit = p.stage_actual != null && p.stage_actual === p.stage_guess;
  const YouI = STAGE_ICON[p.stage_guess] ?? CircleCheck;
  const DataI = p.stage_actual ? STAGE_ICON[p.stage_actual] ?? CircleCheck : null;
  const sentence = p.stage_actual == null
    ? "Za mało danych w tym okresie, żeby ocenić etapy."
    : p.stage_actual === "żaden"
      ? "Według danych żaden etap nie pogorszył się wyraźnie (o więcej niż 5%)."
      : `Według danych najbardziej pogorszyło się: ${stageName(p.stage_actual)}.`;
  return (
    <div className="pv2">
      <div className="pv2-sec">
        <h4>Profit {p.window_from && p.window_to ? `${dayLabel(p.window_from)} – ${dayLabel(p.window_to)}` : "w okresie"}</h4>
        <div className="pv2-scale">
          <div className="pv2-track">
            <i className="pv2-zero" style={{ left: pos(0) }} />
            <span className="pv2-m you" style={{ left: pos(a) }}><b>{zl(a)}</b><em>Twój typ</em></span>
            {b != null && <span className="pv2-m data" style={{ left: pos(b) }}><em>Dane</em><b>{zl(b)}</b></span>}
          </div>
        </div>
      </div>
      <div className="pv2-sec">
        <h4>Co się pogorszyło</h4>
        <div className="pv2-st">
          <div className="pv2-t you"><YouI size={22} /><span>Twój typ</span><b>{stageName(p.stage_guess)}</b></div>
          <div className={`pv2-t data ${hit ? "hit" : p.stage_actual == null ? "" : "miss"}`}>{DataI ? <DataI size={22} /> : <span className="pv2-q">?</span>}<span>Dane</span><b>{p.stage_actual == null ? "za mało danych" : stageName(p.stage_actual)}</b></div>
        </div>
        <p className="pv2-s">{hit ? <><CircleCheck size={15} /> Trafione. </> : null}{sentence}</p>
      </div>
    </div>
  );
}

export const LEVER_ICON: Record<string, typeof Eye> = {
  cpm: Eye, ctr: MousePointerClick, cr: ShoppingCart, aov: Wallet, e_list: Users, e_freq: Send, e_open: MailOpen, e_ctor: MousePointerClick, e_cr: ShoppingCart,
};
export const CAT_ICON: Record<CatKey, typeof Eye> = { ads: Megaphone, email: Mail, page: Globe, offer: Gift };
type Eng = NonNullable<ReportData["engine"]>;
/** „Najlepszy okres” dla dźwigni: reklamy – 7 dni, maile – 14 dni. */
export const bestLabel = (k: string) => (k.startsWith("e_") ? "najlepsze 14 dni" : "najlepszy tydzień");

/** Kategorie jako kafle (kwota w zł/mies. albo brak danych) – klik pokazuje dźwignie tej kategorii. */
export function CategoryBoard({ eng, guess, focus, renderDetail }: { eng: Eng; guess?: string | null; focus?: string | null; renderDetail?: (k: string) => React.ReactNode }) {
  const cats = categories(eng);
  const top = cats[0]?.value != null ? cats[0].key : null;
  const topLeverKey = allLevers(eng).find((l) => l.value != null)?.key ?? null;
  const [sel, setSel] = useState<CatKey>(cats.find((c) => c.levers.some((l) => l.key === focus))?.key ?? top ?? cats[0].key);
  const [open, setOpen] = useState<string | null>(null);
  const c = cats.find((x) => x.key === sel)!;
  return (
    <div className="cb">
      <div className="cb-tiles">
        {cats.map((x) => {
          const I = CAT_ICON[x.key];
          return (
            <button key={x.key} className={`cb-tile ${sel === x.key ? "on" : ""} ${x.value == null ? "nodata" : ""}`} onClick={() => { setSel(x.key); setOpen(null); }}>
              <span className="cb-ic"><I size={22} /></span>
              <b>{x.name}</b>
              {x.value == null ? <em className="gap-tag">brak danych</em> : <span className="cb-v">{zlSigned(x.value)}<small>/mies.</small></span>}
              <span className="cb-tags">
                {guess === `${CAT}${x.key}` && <em className="lb-tag you">Twój typ</em>}
                {top === x.key && <em className="lb-tag top">Dane: nr 1</em>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cb-body">
        {c.levers.filter((l) => l.value == null && l.missing).map((l) => (
          <p key={l.key} className="cb-miss"><span className="gap-tag">brak danych</span> <b>{LEVER_NAMES[l.key].name}</b> {l.missing}</p>
        ))}
        {!c.levers.length && <p className="cb-miss"><span className="gap-tag">brak danych</span> {c.key === "email" ? "zaimportuj raport kampanii mailowych (Dane → Import)" : "brak danych"}</p>}
        <LeverBars levers={c.levers} focus={focus} guess={guess} topKey={topLeverKey} open={open} onPick={(k) => setOpen(open === k ? null : k)}
          detail={(k) => <>{<LeverDetail eng={eng} k={k} />}{renderDetail?.(k)}</>} />
      </div>
    </div>
  );
}

/** Dźwignie jako paski w zł/mies. */
export function LeverBars({ levers, focus, onPick, open, guess, detail, topKey }: { levers: Pick<AnyLever, "key" | "value" | "range" | "lowConfidence">[]; focus?: string | null; onPick?: (k: string) => void; open?: string | null; guess?: string | null; detail?: (k: string) => React.ReactNode; topKey?: string | null }) {
  const max = Math.max(1, ...levers.map((l) => (l.lowConfidence && l.range ? l.range[1] : l.value ?? 0)));
  return (
    <div className="lb">
      {levers.map((l, i) => {
        const v = l.value ?? 0;
        const Tag = onPick ? "button" : "div";
        return (
          <Fragment key={l.key}>
          <Tag className={`lb-row ${focus === l.key ? "focus" : ""} ${open === l.key ? "open" : ""} ${guess === l.key ? "guess" : ""}`} {...(onPick ? { onClick: () => onPick(l.key) } : {})}>
            <span className="lb-n">{i + 1}</span>
            <span className="lb-name">{LEVER_NAMES[l.key].name}<small>{LEVER_NAMES[l.key].short}{guess === l.key && <em className="lb-tag you">Twój typ</em>}{(topKey === undefined ? i === 0 && l.value != null : topKey === l.key) && <em className="lb-tag top">Dane: nr 1</em>}</small></span>
            <span className="lb-track">
              {l.value == null ? <em className="gap-tag">brak danych</em> : (
                <>
                  {l.lowConfidence && l.range && <i className="lb-range" style={{ left: `${(Math.max(0, l.range[0]) / max) * 100}%`, width: `${((l.range[1] - Math.max(0, l.range[0])) / max) * 100}%` }} />}
                  <i className="lb-fill" style={{ width: `${(v / max) * 100}%` }} />
                </>
              )}
            </span>
            <span className="lb-val">{l.value == null ? "" : l.lowConfidence ? <>{range(l.range)}<small>mało danych</small></> : <>{zlSigned(l.value)}<small>/mies.</small></>}</span>
            {focus === l.key && <Flag size={15} className="lb-flag" />}
            {onPick && <ChevronDown size={16} className="lb-chev" />}
          </Tag>
          {open === l.key && detail && <div className="lb-detail">{detail(l.key)}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}

const better = (k: string, a: number, b: number) => (k === "cpm" ? a <= b : a >= b);

/** Szczegóły dźwigni: ile warta jednostka, teraz vs najlepszy okres (kolorami), zysk z powrotu i z +10%. */
export function LeverDetail({ eng, k }: { eng: Eng; k: string }) {
  const L = allLevers(eng).find((l) => l.key === k);
  if (!L) return null;
  const N = LEVER_NAMES[k];
  const email = k.startsWith("e_");
  const best = bestLabel(k);
  const unit = email ? null : k === "cpm" ? { label: "1000 wyświetleń", v: eng.units.perMille } : k === "ctr" ? { label: "1 kliknięcie", v: eng.units.perClick } : { label: "1 zamówienie", v: eng.units.perOrder };
  const plus10 = L.current != null ? (email ? L.current * 1.1 : improve(k as MetricKey, L.current, 0.1)) : null;
  const max = Math.max(L.current ?? 0, L.benchmark ?? 0) || 1;
  const ok = L.current != null && L.benchmark != null && better(k, L.current, L.benchmark);
  const diff = L.current != null && L.benchmark ? Math.abs(L.current / L.benchmark - 1) : null;
  return (
    <div className="ld2">
      <div className="ld2-cmp">
        <h4>{N.name} ({N.short}): teraz vs {best}</h4>
        <div className="ld2-bars">
          <div className={`ld2-bar ${ok ? "good" : "bad"}`}><span>Teraz</span><div><i style={{ width: `${((L.current ?? 0) / max) * 100}%` }} /></div><b>{fm(k, L.current)}</b></div>
          <div className="ld2-bar best"><span>{best[0].toUpperCase() + best.slice(1)}</span><div><i style={{ width: `${((L.benchmark ?? 0) / max) * 100}%` }} /></div><b>{fm(k, L.benchmark)}</b></div>
        </div>
        {diff != null && <p className={ok ? "pos" : "neg"}>{ok ? "Teraz jest tak dobrze jak w najlepszym okresie albo lepiej." : `Teraz jest o ${Math.round(diff * 100)}% gorzej niż w najlepszym okresie${k === "cpm" ? " (przy CPM niżej = lepiej)" : ""}.`}</p>}
      </div>
      <div className="ld2-cards">
        {unit && <div className="ld-card unit"><h4>Ile jest warte {unit.label}</h4><b>{zl(unit.v)}</b><small>profitu na czysto</small></div>}
        <div className="ld-card hero">
          <h4>Gdyby {N.short} wrócił do poziomu z okresu: {best}</h4>
          {L.missing ? <p>brak danych: {L.missing}</p> : L.lowConfidence ? <><b>{range(L.range)}</b><small>miesięcznie · mało danych, dlatego zakres</small></> : <><b>{zlSigned(L.value)}</b><small>więcej profitu miesięcznie</small></>}
        </div>
        <div className="ld-card"><h4>Mały krok: {N.short} lepszy o 10%</h4><p>{fm(k, L.current)} → {fm(k, plus10)}</p><b className="pos">{zlSigned(L.per10)} / mies.</b></div>
      </div>
    </div>
  );
}

/** Interaktywna mapa lejka osadzona w raporcie (aktualne dane, tylko podgląd). */
function MapsEmbed({ maps }: { maps: { name: string; href: string }[] }) {
  const [i, setI] = useState(0);
  const m = maps[Math.min(i, maps.length - 1)];
  return (
    <div className="mp">
      <div className="mp-bar">
        {maps.length > 1 && maps.map((x, k) => <button key={x.href} className={`tile sm ${k === i ? "on" : ""}`} onClick={() => setI(k)}><Workflow size={16} /> {x.name}</button>)}
        {maps.length === 1 && <b><Workflow size={16} /> {m.name}</b>}
        <a href={m.href} target="_blank" rel="noreferrer" className="btn small"><ExternalLink size={14} /> Pełny ekran</a>
      </div>
      <iframe key={m.href} src={m.href} title={`Mapa lejka: ${m.name}`} className="mp-frame no-print" loading="lazy" />
      <p className="mp-print">Mapa interaktywna dostępna w wersji online raportu.</p>
    </div>
  );
}

function Section({ icon: I, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <section className="rp-sec">
      <h2><I size={18} /> {title}</h2>
      {children}
    </section>
  );
}

/** Raport z sesji – od góry do dołu, liczby zamrożone w dniu sesji. */
export function ReportView({ r, title, maps }: { r: ReportData; title?: React.ReactNode; maps?: { name: string; href: string }[] }) {
  const g = r.gap as unknown as GoalGap | null;
  const eng = r.engine;
  const [open, setOpen] = useState<string | null>(null);
  const dateTxt = new Date(r.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="rp">
      <header className="rp-head">
        {title ?? <h1>{r.title || `Raport – ${r.client} – ${dateTxt}`}</h1>}
        {r.range && <p>Okres: {dayLabel(r.range.from)} – {dayLabel(r.range.to)} {r.range.to.slice(0, 4)}</p>}
      </header>

      {r.decision && (
        <Section icon={Flag} title="Najważniejszy punkt">
          <DecisionCard d={r.decision} />
        </Section>
      )}

      {maps && maps.length > 0 && (
        <Section icon={MapIcon} title="Mapa lejka – na żywo">
          <MapsEmbed maps={maps} />
        </Section>
      )}

      {r.reality.period && (
        <Section icon={Target} title="Okres raportu">
          <div className="rp-kpis">
            <div><em>Profit na czysto</em><b className={r.reality.period.profit < 0 ? "neg" : "pos"}>{zl(r.reality.period.profit)}</b>{r.reality.periodPrev && <small>poprzedni okres: {zl(r.reality.periodPrev.profit)}</small>}</div>
            <div><em>Przychód</em><b>{zl(r.reality.period.revenue)}</b></div>
            <div><em>Reklamy</em><b>{zl(r.reality.period.spend)}</b></div>
            <div><em>Zamówienia</em><b>{r.reality.period.orders}</b></div>
          </div>
          {r.reality.periodDays?.length > 0 && <ProfitBars items={r.reality.periodDays.map((m) => ({ label: dayLabel(m.from), value: m.profit }))} />}
        </Section>
      )}

      {g && (
        <Section icon={Target} title="Cel i wynik">
          <div className="rp-kpis">
            <div><em>Cel</em><b>{zl(g.target)}</b></div>
            <div><em>Wynik</em><b>{zl(g.achieved)}</b></div>
            <div><em>Brakuje</em><b className={g.gap > 0 ? "neg" : "pos"}>{zl(Math.max(0, g.gap))}</b></div>
          </div>
          <GoalChart g={g} />
          <PaceBars pace={g.pacePerDay} need={g.needFromNow} />
        </Section>
      )}

      {r.prediction && (
        <Section icon={MessageCircleQuestion} title="Predykcja vs dane">
          <PredictionVs p={r.prediction} />
        </Section>
      )}

      <Section icon={Target} title="Dane">
        <DataGaps gaps={r.reality.gaps} />
        <h3 className="rp-sub">Profit tygodniowo (8 tygodni)</h3>
        <ProfitBars items={r.reality.weeks.map((w) => ({ label: dayLabel(w.from), value: w.profit }))} />
      </Section>

      {eng && (
        <Section icon={Sparkles} title="Gdzie leżą pieniądze">
          <div className="rp-units">
            <span>1 zamówienie = <b>{zl(eng.units.perOrder)}</b> profitu</span>
            <span>1 kliknięcie = <b>{zl(eng.units.perClick)}</b></span>
            <span>1000 wyświetleń = <b>{zl(eng.units.perMille)}</b></span>
          </div>
          <CategoryBoard eng={eng} focus={r.focus} guess={r.prediction?.lever_guess} />
        </Section>
      )}

      {r.questions.length > 0 && (
        <Section icon={MessageCircleQuestion} title="Pytania i odpowiedzi">
          <div className="chat">
            {r.questions.map((x, i) => (
              <Fragment key={i}>
                <div className="chat-q"><span>{i + 1}</span><p>{x.q}</p></div>
                <div className="chat-a"><p>{x.a}</p></div>
              </Fragment>
            ))}
          </div>
        </Section>
      )}

      {(r.analysis || r.analysisSkipped) && (
        <Section icon={Sparkles} title="Analiza Claude">
          {r.analysis ? <RichText text={r.analysis} /> : <p>Pominięta{r.analysisSkipped ? ` – ${r.analysisSkipped}` : ""}.</p>}
        </Section>
      )}

      {r.verdicts.length > 0 && (
        <Section icon={Trophy} title="Sprawdzone decyzje">
          <ul className="rp-ver">
            {r.verdicts.map((d) => (
              <li key={d.id}>
                <Deadline date={d.check_date} done />
                <b>{d.what}</b>
                <span className={`chip ${d.verdict === "tak" ? "on" : ""}`}>{d.verdict}</span>
                {d.impact_month != null && <span className={d.impact_month < 0 ? "neg" : "pos"}>{d.low_confidence ? `${zlSigned(d.impact_low)} … ${zlSigned(d.impact_high)}` : zlSigned(d.impact_month)}/mies.</span>}
                {d.learning && <p>{d.learning}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.summary && (
        <section className="rp-lesson">
          <CircleCheck size={26} />
          <div><em>Wniosek</em><p>{r.summary}</p></div>
        </section>
      )}

      <Section icon={Trophy} title="Licznik efektów">
        <div className="rp-kpis">
          <div><em>Zweryfikowane decyzje</em><b><span className="pos">{zlSigned(r.counter.plus)}</span> / <span className="neg">{zlSigned(r.counter.minus)}</span></b><small>ile zł miesięcznie zarobiły (+) i straciły (−) decyzje, które już sprawdziłeś</small></div>
          <div><em>Trafność hipotez</em><b>{pct(r.counter.hitRate)}</b><small>w ilu sprawdzonych decyzjach miałeś rację</small></div>
          <div><em>Średni błąd predykcji</em><b>{zl(r.counter.meanError)}</b><small>o ile średnio myliłeś się, zgadując profit tygodnia – im mniej, tym lepsza intuicja</small></div>
        </div>
      </Section>
    </article>
  );
}
