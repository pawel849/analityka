"use client";

import { CircleCheck, Eye, Flag, MessageCircleQuestion, MousePointerClick, ShoppingCart, Sparkles, Target, Trophy, Wallet } from "lucide-react";
import { LEVER_NAMES } from "@/lib/loop-def";
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
    ? "Za mało danych z ostatnich dwóch tygodni, żeby ocenić etapy."
    : p.stage_actual === "żaden"
      ? "Według danych żaden etap nie pogorszył się wyraźnie (o więcej niż 5%)."
      : `Według danych najbardziej pogorszyło się: ${stageName(p.stage_actual)}.`;
  return (
    <div className="pv2">
      <div className="pv2-sec">
        <h4>Profit ostatnich 7 dni</h4>
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

/** Dźwignie jako paski w zł/mies. */
export function LeverBars({ levers, focus, onPick, open, guess }: { levers: NonNullable<ReportData["engine"]>["ranking"]["levers"]; focus?: string | null; onPick?: (k: string) => void; open?: string | null; guess?: string | null }) {
  const max = Math.max(1, ...levers.map((l) => (l.lowConfidence && l.range ? l.range[1] : l.value ?? 0)));
  return (
    <div className="lb">
      {levers.map((l, i) => {
        const v = l.value ?? 0;
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={l.key} className={`lb-row ${focus === l.key ? "focus" : ""} ${open === l.key ? "open" : ""} ${guess === l.key ? "guess" : ""} ${i === 0 && l.value != null ? "top" : ""}`} {...(onPick ? { onClick: () => onPick(l.key) } : {})}>
            <span className="lb-n">{i + 1}</span>
            <span className="lb-name">{LEVER_NAMES[l.key].name}<small>{LEVER_NAMES[l.key].short}{guess === l.key && <em className="lb-tag you">Twój typ</em>}{i === 0 && l.value != null && <em className="lb-tag top">Dane: nr 1</em>}</small></span>
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
          </Tag>
        );
      })}
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
export function ReportView({ r }: { r: ReportData }) {
  const g = r.gap as unknown as GoalGap | null;
  const eng = r.engine;
  const scope = (xs: string[], all: string) => (xs.length ? xs.join(", ") : all);
  return (
    <article className="rp">
      <header className="rp-head">
        <span>{r.client}</span>
        <h1>{r.project}</h1>
        <p>Raport z sesji analitycznej · {new Date(r.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</p>
        <p className="rp-scope">Kampanie: {scope(r.scope.campaigns, "wszystkie")} · Produkty: {scope(r.scope.products, "wszystkie")}</p>
      </header>

      {r.decision && (
        <Section icon={Flag} title="Decyzja">
          <DecisionCard d={r.decision} />
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
          <LeverBars levers={eng.ranking.levers} focus={r.focus} guess={r.prediction?.lever_guess} />
          <div className="rp-units">
            <span>1 zamówienie = <b>{zl(eng.units.perOrder)}</b> profitu</span>
            <span>1 kliknięcie = <b>{zl(eng.units.perClick)}</b></span>
            <span>1000 wyświetleń = <b>{zl(eng.units.perMille)}</b></span>
          </div>
          <table className="tbl rp-tbl">
            <thead><tr><th /><th className="num">Teraz</th><th className="num">Najlepszy tydzień</th><th className="num">+10% =</th></tr></thead>
            <tbody>
              {eng.ranking.levers.map((l) => (
                <tr key={l.key}><td>{LEVER_NAMES[l.key].name} ({LEVER_NAMES[l.key].short})</td><td className="num">{fm(l.key, l.current)}</td><td className="num">{fm(l.key, l.benchmark)}</td><td className="num">{zlSigned(l.per10)}/mies.</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {r.questions.length > 0 && (
        <Section icon={MessageCircleQuestion} title="Pytania i odpowiedzi">
          <ol className="rp-qa">{r.questions.map((x, i) => <li key={i}><p>{x.q}</p><blockquote>{x.a}</blockquote></li>)}</ol>
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
        <Section icon={CircleCheck} title="Wniosek">
          <p className="rp-summary">{r.summary}</p>
        </Section>
      )}

      <Section icon={Trophy} title="Licznik efektów">
        <div className="rp-kpis">
          <div><em>Zweryfikowane decyzje</em><b><span className="pos">{zlSigned(r.counter.plus)}</span> / <span className="neg">{zlSigned(r.counter.minus)}</span></b></div>
          <div><em>Trafność hipotez</em><b>{pct(r.counter.hitRate)}</b></div>
          <div><em>Średni błąd predykcji</em><b>{zl(r.counter.meanError)}</b></div>
        </div>
      </Section>
    </article>
  );
}
