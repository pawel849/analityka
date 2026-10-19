"use client";

import { CircleCheck, Flag, MessageCircleQuestion, Sparkles, Target, Trophy, X } from "lucide-react";
import { LEVER_NAMES } from "@/lib/loop-def";
import type { ReportData } from "@/lib/loop";
import { DecisionCard, Deadline } from "./Decisions";
import { DataGaps, dayLabel, fm, GoalChart, PaceBars, pct, ProfitBars, range, RichText, zl, zlSigned, type GoalGap } from "./ui";

const STAGE: Record<string, string> = { cpm: "Wyświetlenia (CPM)", ctr: "Kliknięcia (CTR)", cr: "Zakupy po kliknięciu (CR)", aov: "Koszyk (AOV)", "żaden": "Żaden" };
export const stageName = (k: string | null | undefined) => (k == null ? "za mało danych" : STAGE[k] ?? k);

/** Predykcja vs dane: dwa słupki + trafienie etapu. */
export function PredictionVs({ p }: { p: NonNullable<ReportData["prediction"]> }) {
  const a = p.profit_guess, b = p.profit_actual ?? 0;
  const max = Math.max(1, Math.abs(a), Math.abs(b));
  const hit = p.stage_actual != null && p.stage_actual === p.stage_guess;
  return (
    <div className="pv">
      <div className="pv-col">
        <h4>Profit ostatnich 7 dni</h4>
        <div className="pv-bars">
          <div><i style={{ height: `${(Math.abs(a) / max) * 100}%` }} className={`you ${a < 0 ? "neg" : ""}`} /><b>{zl(a)}</b><span>Ty</span></div>
          <div><i style={{ height: `${(Math.abs(b) / max) * 100}%` }} className={`data ${b < 0 ? "neg" : ""}`} /><b>{zl(p.profit_actual)}</b><span>Dane</span></div>
        </div>
        <small>pomyłka o {zl(Math.abs(a - b))}</small>
      </div>
      <div className="pv-col">
        <h4>Co się pogorszyło</h4>
        <div className={`pv-stage ${p.stage_actual == null ? "" : hit ? "hit" : "miss"}`}>
          {p.stage_actual == null ? <span>?</span> : hit ? <CircleCheck size={28} /> : <X size={28} />}
          <div><span>Ty: <b>{stageName(p.stage_guess)}</b></span><span>Dane: <b>{stageName(p.stage_actual)}</b></span></div>
        </div>
      </div>
    </div>
  );
}

/** Dźwignie jako paski w zł/mies. */
export function LeverBars({ levers, focus, onPick, open }: { levers: NonNullable<ReportData["engine"]>["ranking"]["levers"]; focus?: string | null; onPick?: (k: string) => void; open?: string | null }) {
  const max = Math.max(1, ...levers.map((l) => (l.lowConfidence && l.range ? l.range[1] : l.value ?? 0)));
  return (
    <div className="lb">
      {levers.map((l, i) => {
        const v = l.value ?? 0;
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={l.key} className={`lb-row ${focus === l.key ? "focus" : ""} ${open === l.key ? "open" : ""}`} {...(onPick ? { onClick: () => onPick(l.key) } : {})}>
            <span className="lb-n">{i + 1}</span>
            <span className="lb-name">{LEVER_NAMES[l.key].name}<small>{LEVER_NAMES[l.key].short}</small></span>
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
          <LeverBars levers={eng.ranking.levers} focus={r.focus} />
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

      {r.analysis && (
        <Section icon={Sparkles} title="Analiza Claude">
          <RichText text={r.analysis} />
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
