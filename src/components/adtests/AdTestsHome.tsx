"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, BatteryLow, BookOpen, CalendarClock, CircleCheck, FlaskConical, GraduationCap, Hourglass, Layers, MessagesSquare, Package, Play, Plus, Scale,
  ShoppingBag, SlidersHorizontal, Tag, Target, TrendingUp, TriangleAlert, Trophy, Users, UsersRound, Wallet, X,
} from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { DEFAULT_TEST_SETTINGS, ELEMENTS, budgetPerVariant, mergeTestSettings, type TestSettings } from "@/lib/ad-tests";
import type { ProjectSettings } from "@/lib/settings";
import type { TestResult } from "@/lib/ad-tests-data";

export const zl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("pl-PL")} zł`);
export const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: d })}%`);

type Tab = "testy" | "biblioteka" | "ustawienia";
interface Product { name: string; count: number; paid: number; gross: number }

export const STATUS_ICON = { planowany: CalendarClock, "w toku": Play, "zakończony": CircleCheck } as const;

export function AdTestsHome({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("testy");
  const tabs: [Tab, string, typeof FlaskConical][] = [
    ["testy", "Testy", FlaskConical],
    ["biblioteka", "Zwycięzcy", Trophy],
    ["ustawienia", "Ustawienia", SlidersHorizontal],
  ];
  return (
    <div className="at-home">
      <nav className="seg big">
        {tabs.map(([k, l, Icon]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><Icon size={16} /> {l}</button>
        ))}
      </nav>
      {tab === "testy" && <TestList projectId={projectId} goSettings={() => setTab("ustawienia")} />}
      {tab === "biblioteka" && <Library projectId={projectId} />}
      {tab === "ustawienia" && <TestSettingsForm projectId={projectId} />}
    </div>
  );
}

/* ---------- Wspólne: ustawienia + wybór produktu ---------- */

function useTestSettings(projectId: string) {
  const [all, setAll] = useState<ProjectSettings | null>(null);
  const [s, setS] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);
  useEffect(() => {
    api<ProjectSettings>(`/api/projects/${projectId}/settings`).then((x) => {
      setAll(x);
      setS(mergeTestSettings(x.adTests));
    });
  }, [projectId]);
  const save = async (next: TestSettings) => {
    if (!all) return;
    await api(`/api/projects/${projectId}/settings`, "PUT", { ...all, adTests: next });
    setS(next);
  };
  return { all, s, setS, save };
}

function useProducts(projectId: string) {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    api<Product[]>(`/api/projects/${projectId}/products`).then(setProducts).catch(() => setProducts([]));
  }, [projectId]);
  return products;
}

const productIcon = (n: string) => {
  const f = n.toLowerCase();
  if (/e-?book|poradnik|księg|ksiazk|pdf/.test(f)) return BookOpen;
  if (/warsztat|dni otwarte|stacjonar/.test(f)) return Users;
  if (/konsultac|mentoring|1:1/.test(f)) return MessagesSquare;
  if (/społeczno|spolecznosc|abonament|członk/.test(f)) return UsersRound;
  if (/kurs|program|szkoleni|akademi|trening/.test(f)) return GraduationCap;
  return Package;
};
/** Nazwa produktu: część do pierwszej kropki jako tytuł, reszta jako dopisek. */
export const splitName = (n: string) => {
  const i = n.indexOf(". ");
  return i > 8 && i < 70 ? [n.slice(0, i), n.slice(i + 2)] : [n, ""];
};

/** Wybór produktu jako kafelki z ikoną: płatne najczęściej kupowane na górze, darmowe ukryte. */
function ProductPick({ products, selected, onChange }: { products: Product[] | null; selected: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const [free, setFree] = useState(false);
  if (!products) return <p>Wczytuję produkty…</p>;
  if (!products.length) return <p className="warn-box"><TriangleAlert size={16} /> Brak zamówień – podłącz sklep w „Źródłach danych”.</p>;
  const sel = new Set(selected);
  const term = q.trim().toLowerCase();
  const list = [...products, ...selected.filter((n) => !products.some((p) => p.name === n)).map((name) => ({ name, count: 0, paid: 1, gross: 0 }))]
    .filter((p) => (free || p.paid > 0 || sel.has(p.name)) && (!term || p.name.toLowerCase().includes(term)));
  const shown = term || more ? list : list.slice(0, 9);
  const toggle = (n: string) => onChange(sel.has(n) ? selected.filter((x) => x !== n) : [...selected, n]);
  return (
    <div className="pp">
      <input placeholder="Szukaj produktu…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pp-grid">
        {shown.map((p) => {
          const Icon = productIcon(p.name);
          const [title, sub] = splitName(p.name);
          return (
            <button type="button" key={p.name} className={`pp-tile ${sel.has(p.name) ? "on" : ""}`} onClick={() => toggle(p.name)} title={p.name}>
              <span className="pp-ic"><Icon size={20} /></span>
              {sel.has(p.name) && <CircleCheck size={18} className="pp-ok" />}
              <b>{title}</b>
              {sub && <span>{sub}</span>}
            </button>
          );
        })}
        {!shown.length && <p>Nic nie pasuje.</p>}
      </div>
      <div className="row">
        {!term && list.length > 9 && <button type="button" className="btn small" onClick={() => setMore((v) => !v)}>{more ? "Pokaż mniej" : `Pokaż wszystkie (${list.length})`}</button>}
        <label className="pp-free"><input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> pokaż też darmowe</label>
      </div>
    </div>
  );
}

/* ---------- Kreator nowego testu ---------- */

function NewTestWizard({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { all, s, save } = useTestSettings(projectId);
  const products = useProducts(projectId);
  const [step, setStep] = useState(0);
  const [angle, setAngle] = useState("");
  const [prod, setProd] = useState<string[] | null>(null);
  const [maxIn, setMaxIn] = useState<string | null>(null);
  const [winIn, setWinIn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chosen = prod ?? s.productMatch;
  const maxVal = maxIn ?? String(s.loseCac);
  const winVal = winIn ?? String(Math.min(s.cacMax, Number(maxVal) || s.cacMax));
  const lose = Number(maxVal) || 0;
  const win = Math.min(Number(winVal) || 0, lose);
  const next = { ...s, productMatch: chosen, loseCac: lose || s.loseCac, cacMax: win || s.cacMax };
  const finish = async () => {
    setBusy(true);
    setErr("");
    try {
      if (JSON.stringify(next) !== JSON.stringify(s)) await save(next);
      const r = await api<{ id: string }>(`/api/projects/${projectId}/ad-tests`, "POST", { angle: angle.trim() });
      location.href = `/projects/${projectId}/testy/${r.id}?nowa=1`;
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  };
  const steps = ["Obietnica", "Produkt", "Limit kosztu", "Gotowe"];
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wiz wide" role="dialog" aria-modal="true" aria-label="Nowy test reklam">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b className="wiz-title"><FlaskConical size={18} /> Nowy test reklam</b>
          <button className="icon-btn" onClick={onClose} aria-label="Zamknij"><X size={18} /></button>
        </div>
        <ol className="wiz-steps">
          {steps.map((x, i) => <li key={x} className={i === step ? "on" : i < step ? "done" : ""}><span>{i + 1}</span>{x}</li>)}
        </ol>
        {!all ? (
          <p>Wczytuję…</p>
        ) : step === 0 ? (
          <form className="wiz-body" onSubmit={(e) => { e.preventDefault(); if (angle.trim()) setStep(1); }}>
            <label className="wiz-q">Jaką obietnicę (kąt) testujesz? <Tip text="Główna myśl reklamy, np. „Amerykański coach” albo „Mów pewnie w 15 minut dziennie”. W jednym teście zmieniasz po jednym elemencie tej reklamy (hook, tekst, wideo…) w kolejnych rundach." /></label>
            <input autoFocus value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="np. Amerykański coach" />
            <div className="wiz-nav"><span /><button className="btn primary" disabled={!angle.trim()}>Dalej <ArrowRight size={16} /></button></div>
          </form>
        ) : step === 1 ? (
          <div className="wiz-body">
            <label className="wiz-q">Co sprzedaje ta reklama? <Tip text="Zaznacz produkt, którego zakup liczymy jako „kursanta”. Koszt kursanta = wydatki wariantu ÷ liczba zakupów tego produktu. Ustawienie wspólne dla wszystkich testów." /></label>
            <ProductPick products={products} selected={chosen} onChange={setProd} />
            <div className="wiz-nav">
              <button type="button" className="btn" onClick={() => setStep(0)}><ArrowLeft size={16} /> Wstecz</button>
              <button className="btn primary" disabled={!chosen.length} onClick={() => setStep(2)}>Dalej <ArrowRight size={16} /></button>
            </div>
          </div>
        ) : step === 2 ? (
          <form className="wiz-body" onSubmit={(e) => { e.preventDefault(); if (lose > 0 && win > 0) setStep(3); }}>
            <label className="wiz-q">Ile maksymalnie zapłacisz za kursanta? <Tip text="Powyżej tej kwoty wariant przegrywa i wyłączasz go." /></label>
            <div className="money-input"><input autoFocus inputMode="decimal" value={maxVal} onChange={(e) => setMaxIn(e.target.value.replace(",", "."))} /><span>zł</span></div>
            <label className="wiz-q small">Przy jakim koszcie wariant wygrywa? <Tip text="Wariant z kosztem kursanta poniżej tej kwoty może zostać zwycięzcą. Między tą kwotą a maksimum – obserwujesz dalej." /></label>
            <div className="money-input sm"><span>poniżej</span><input inputMode="decimal" value={winVal} onChange={(e) => setWinIn(e.target.value.replace(",", "."))} /><span>zł</span></div>
            <CacZones s={{ ...s, cacMax: win, loseCac: lose }} />
            <div className="wiz-nav">
              <button type="button" className="btn" onClick={() => setStep(1)}><ArrowLeft size={16} /> Wstecz</button>
              <button className="btn primary" disabled={!(lose > 0 && win > 0)}>Dalej <ArrowRight size={16} /></button>
            </div>
          </form>
        ) : (
          <div className="wiz-body">
            <label className="wiz-q">Sprawdź i załóż test</label>
            <div className="wiz-sum">
              <div><Target size={18} /><span>Obietnica</span><b>{angle}</b></div>
              <div><ShoppingBag size={18} /><span>Produkt</span><b>{chosen.length === 1 ? splitName(chosen[0])[0] : `${chosen.length} produkty`}</b></div>
              <div><Trophy size={18} /><span>Wygrywa poniżej</span><b>{zl(next.cacMax)}</b></div>
              <div><X size={18} /><span>Przegrywa powyżej</span><b>{zl(next.loseCac)}</b></div>
            </div>
            {err && <p className="error">{err}</p>}
            <div className="wiz-nav">
              <button type="button" className="btn" onClick={() => setStep(2)} disabled={busy}><ArrowLeft size={16} /> Wstecz</button>
              <button className="btn primary" disabled={busy} onClick={finish}>{busy ? "Zakładam…" : "Załóż test"} <ArrowRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Strefy kosztu kursanta: wygrana poniżej celu, obserwacja do maksimum, przegrana powyżej maksimum. */
function CacZones({ s }: { s: TestSettings }) {
  const lose = Math.max(s.loseCac, s.cacMax);
  const max = lose * 1.3 || 1;
  const w1 = (Math.min(s.cacMax, lose) / max) * 100;
  const w2 = Math.max(0, ((lose - s.cacMax) / max) * 100);
  return (
    <div className="cac-zones" aria-label="Strefy kosztu kursanta">
      <div className="cz-bar">
        <span className="cz-win" style={{ width: `${w1}%` }}><Trophy size={14} /> wygrana</span>
        <span className="cz-mid" style={{ width: `${w2}%` }}>{w2 > 14 ? "obserwuj" : ""}</span>
        <span className="cz-lose"><X size={14} /> przegrana</span>
      </div>
      <div className="cz-labels">
        <span style={{ left: 0 }}>0 zł</span>
        {w2 > 8 && <span style={{ left: `${w1}%` }}>{zl(s.cacMax)}</span>}
        <span style={{ left: `${w1 + w2}%` }}>{zl(lose)}</span>
      </div>
    </div>
  );
}

/* ---------- Lista testów ---------- */

function TestList({ projectId, goSettings }: { projectId: string; goSettings: () => void }) {
  const [data, setData] = useState<{ settings: TestSettings; tests: TestResult[] } | null>(null);
  const [err, setErr] = useState("");
  const [wizard, setWizard] = useState(false);
  const load = useCallback(() => api<{ settings: TestSettings; tests: TestResult[] }>(`/api/projects/${projectId}/ad-tests`).then(setData).catch((e) => setErr(e.message)), [projectId]);
  useEffect(() => {
    load();
  }, [load]);
  if (err) return <p className="error">{err}</p>;
  if (!data) return <p>Liczę wyniki…</p>;
  return (
    <div>
      {!data.settings.productMatch.length && data.tests.length > 0 && (
        <div className="warn-box"><TriangleAlert size={16} /> Brak produktu głównego – koszt kursanta liczy wszystkie zamówienia. <button className="btn small" onClick={goSettings}>Ustaw</button></div>
      )}
      <div className="test-grid">
        <button className={`test-tile test-new ${data.tests.length ? "" : "pulse"}`} onClick={() => setWizard(true)}>
          <Plus size={40} strokeWidth={1.6} />
          <b>Nowy test</b>
        </button>
        {data.tests.map((t) => {
          const SI = STATUS_ICON[t.status as keyof typeof STATUS_ICON] ?? Play;
          const c = t.current;
          return (
            <Link key={t.id} href={`/projects/${projectId}/testy/${t.id}`} className="test-tile">
              <div className="tt-head">
                <span className={`tt-status st-${t.status.replace(" ", "-")}`} title={t.status}><SI size={16} /></span>
                <b>{t.angle}</b>
              </div>
              <div className="tt-chips">
                <span title="Runda i testowany element"><Layers size={14} /> {c ? `R${c.number} · ${c.element}` : "bez rund"}</span>
                <span title="Najlepszy koszt kursanta w rundzie"><Target size={14} /> {zl(c?.bestCac)}</span>
                <span title="Do werdyktu"><Hourglass size={14} /> {c?.daysToVerdict == null ? "—" : c.daysToVerdict <= 0 ? "teraz" : `${c.daysToVerdict} dn.`}</span>
              </div>
              {t.alarms.length > 0 && <div className="tt-alarm" title={t.alarms.join("\n")}><TriangleAlert size={14} /> {t.alarms.length} {t.alarms.length === 1 ? "alarm" : "alarmy"}</div>}
            </Link>
          );
        })}
      </div>
      {wizard && <NewTestWizard projectId={projectId} onClose={() => setWizard(false)} />}
    </div>
  );
}

/* ---------- Biblioteka zwycięzców ---------- */

function Library({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<{ id: string; angle: string; element: string; change_to: string; idea_source: string; cac: number | null; ctr: number | null; diff_vs_base: number | null; won_at: string; test_id: string | null }[] | null>(null);
  const [angle, setAngle] = useState("");
  const [element, setElement] = useState("");
  useEffect(() => {
    api<typeof rows>(`/api/projects/${projectId}/winning-elements`).then(setRows).catch(() => setRows([]));
  }, [projectId]);
  if (!rows) return <p>Wczytuję…</p>;
  if (!rows.length) return <div className="empty-box"><Trophy size={28} /> Tu trafią zwycięskie warianty – po zatwierdzeniu „wygrał” w rundzie.</div>;
  const angles = [...new Set(rows.map((r) => r.angle))];
  const shown = rows.filter((r) => (!angle || r.angle === angle) && (!element || r.element === element));
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={angle} onChange={(e) => setAngle(e.target.value)}>
          <option value="">Wszystkie kąty</option>
          {angles.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select value={element} onChange={(e) => setElement(e.target.value)}>
          <option value="">Wszystkie elementy</option>
          {ELEMENTS.map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>
      <div className="win-grid">
        {shown.map((r) => (
          <div key={r.id} className="win-card">
            <div className="win-head"><Trophy size={16} /> <span>{r.element}</span></div>
            <b>{r.change_to}</b>
            <div className="tt-chips">
              <span title="Koszt kursanta"><Target size={14} /> {zl(r.cac)}</span>
              {r.diff_vs_base != null && <span title="Różnica względem bazy"><TrendingUp size={14} /> {pct(r.diff_vs_base, 0)}</span>}
              <span title="Data wygranej"><CalendarClock size={14} /> {new Date(r.won_at).toLocaleDateString("pl-PL")}</span>
            </div>
            <div className="win-foot">
              {r.test_id ? <Link href={`/projects/${projectId}/testy/${r.test_id}`}>{r.angle}</Link> : r.angle}
              {r.idea_source && <span title="Źródło pomysłu"> · {r.idea_source}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Ustawienia ---------- */

type Kind = "zl" | "pct" | "int" | "num" | "text";
const UNIT: Record<Kind, string> = { zl: "zł", pct: "%", int: "", num: "×", text: "" };
const GROUPS: { title: string; icon: typeof Wallet; fields: { key: keyof TestSettings; label: string; help: string; kind: Kind; unit?: string }[] }[] = [
  { title: "Pieniądze", icon: Wallet, fields: [
    { key: "loseCac", label: "Maksymalnie zapłacę", help: "Ile najwięcej zapłacisz za kursanta. Wariant droższy przegrywa od razu.", kind: "zl" },
    { key: "cacMax", label: "Wygrywa poniżej", help: "Wariant z kosztem kursanta poniżej tej kwoty może zostać zwycięzcą.", kind: "zl" },
    { key: "budgetPerVariant", label: "Budżet na wariant", help: "Po wydaniu tej kwoty na wariant aplikacja podpowiada decyzję. Puste = 2 × kwota wygranej.", kind: "zl" },
  ] },
  { title: "Werdykt", icon: Scale, fields: [
    { key: "minWinDiff", label: "Różnica do zwycięstwa", help: "Jeśli koszty kursanta różnią się mniej niż o tyle – remis (wygrywa wariant z wyższym CTR).", kind: "pct" },
    { key: "variantsPerRound", label: "Wariantów w rundzie", help: "Zwykle 2–4.", kind: "int" },
    { key: "attributionDays", label: "Okno przypisania", help: "Zakup liczy się wariantowi, jeśli klient wszedł z jego linku najpóźniej tyle dni wcześniej.", kind: "int", unit: "dni" },
  ] },
  { title: "Zmęczenie reklamy", icon: BatteryLow, fields: [
    { key: "fatigueCtrDrop", label: "Spadek CTR", help: "Alarm, gdy tygodniowy CTR zwycięzcy spadnie o tyle względem 1. tygodnia.", kind: "pct" },
    { key: "fatigueCostMult", label: "Wzrost kosztu", help: "Alarm, gdy tygodniowy koszt kursanta wzrośnie tyle razy względem 1. tygodnia.", kind: "num" },
  ] },
  { title: "Skalowanie", icon: TrendingUp, fields: [
    { key: "scaleDays", label: "Dni z dobrym kosztem", help: "Po tylu dniach z kosztem kursanta poniżej maksimum aplikacja podpowie zwiększenie budżetu.", kind: "int", unit: "dni" },
    { key: "scaleStep", label: "Zwiększ budżet o", help: "Podpowiadany krok zwiększenia budżetu.", kind: "pct" },
  ] },
  { title: "Nazwy reklam", icon: Tag, fields: [
    { key: "namingPattern", label: "Wzór nazwy", help: "{KAT} = kąt, {n} = numer rundy, {WARIANT} = litera. Np. AMERYKANSKI_COACH_R2_A.", kind: "text" },
    { key: "goal", label: "Cel testów", help: "Co liczymy jako sukces, np. „zakup kursu”.", kind: "text" },
  ] },
];

function TestSettingsForm({ projectId }: { projectId: string }) {
  const { all, s, setS, save } = useTestSettings(projectId);
  const products = useProducts(projectId);
  const [pick, setPick] = useState(false);
  const [msg, setMsg] = useState("");
  if (!all) return <p>Wczytuję…</p>;
  const set = (k: keyof TestSettings, v: unknown) => {
    setS((x) => ({ ...x, [k]: v }));
    setMsg("");
  };
  return (
    <form
      className="ts-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await save(s);
        setMsg("Zapisano");
      }}
    >
      <section className="ts-card">
        <div className="ts-head"><span className="ts-icon"><ShoppingBag size={18} /></span><b>Co liczymy jako kursanta</b><Tip text="Zakup tych produktów to „kursant”. Koszt kursanta = wydatki wariantu ÷ liczba takich zakupów." /></div>
        <div className="chips">
          {s.productMatch.map((p) => (
            <span key={p} className="chip on">{p}<button type="button" aria-label={`Usuń ${p}`} onClick={() => set("productMatch", s.productMatch.filter((x) => x !== p))}><X size={13} /></button></span>
          ))}
          {!s.productMatch.length && <span className="chip warn"><TriangleAlert size={13} /> nie wybrano</span>}
          <button type="button" className="btn small" onClick={() => setPick((v) => !v)}>{pick ? "Zamknij" : s.productMatch.length ? "Zmień" : "Wybierz produkt"}</button>
        </div>
        {pick && <ProductPick products={products} selected={s.productMatch} onChange={(v) => set("productMatch", v)} />}
      </section>

      <section className="ts-card">
        <div className="ts-head"><span className="ts-icon"><Target size={18} /></span><b>Strefy kosztu kursanta</b><Tip text="Zielone – wariant może wygrać. Krem – obserwujesz dalej. Miedź – powyżej maksimum, wyłączasz." /></div>
        <CacZones s={s} />
      </section>

      <div className="ts-grid">
        {GROUPS.map((g) => (
          <section key={g.title} className="ts-card">
            <div className="ts-head"><span className="ts-icon"><g.icon size={18} /></span><b>{g.title}</b></div>
            {g.fields.map((f) => {
              const v = s[f.key] as number | string | null;
              const unit = f.unit ?? UNIT[f.kind];
              return (
                <label key={f.key} className="ts-field">
                  <span className="ts-label">{f.label} <Tip text={f.help} /></span>
                  <span className="ts-input">
                    {f.kind === "text" ? (
                      <input value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} />
                    ) : (
                      <input
                        type="number"
                        step={f.kind === "num" ? 0.1 : 1}
                        value={v == null ? "" : f.kind === "pct" ? Math.round(Number(v) * 100) : Number(v)}
                        placeholder={f.key === "budgetPerVariant" ? `auto ${budgetPerVariant({ ...s, budgetPerVariant: null })}` : ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") return set(f.key, f.key === "budgetPerVariant" ? null : 0);
                          set(f.key, f.kind === "pct" ? Number(raw) / 100 : Number(raw));
                        }}
                      />
                    )}
                    {unit && <em>{unit}</em>}
                  </span>
                </label>
              );
            })}
          </section>
        ))}
      </div>
      <div className="ts-save">
        {msg && <span className="saved"><CircleCheck size={16} /> {msg}</span>}
        <button className="btn primary">Zapisz ustawienia</button>
      </div>
    </form>
  );
}
