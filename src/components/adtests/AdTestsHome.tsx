"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../forms";
import { DEFAULT_TEST_SETTINGS, ELEMENTS, budgetPerVariant, mergeTestSettings, type TestSettings } from "@/lib/ad-tests";
import type { ProjectSettings } from "@/lib/settings";
import type { TestResult } from "@/lib/ad-tests-data";

export const zl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("pl-PL")} zł`);
export const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: d })}%`);

type Tab = "testy" | "biblioteka" | "ustawienia";

export function AdTestsHome({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("testy");
  return (
    <div>
      <nav className="seg">
        {(
          [
            ["testy", "Testy"],
            ["biblioteka", "Biblioteka zwycięzców"],
            ["ustawienia", "Ustawienia testów"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {tab === "testy" && <TestList projectId={projectId} />}
      {tab === "biblioteka" && <Library projectId={projectId} />}
      {tab === "ustawienia" && <TestSettingsForm projectId={projectId} />}
    </div>
  );
}

function TestList({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ settings: TestSettings; tests: TestResult[] } | null>(null);
  const [err, setErr] = useState("");
  const [angle, setAngle] = useState("");
  const load = useCallback(() => api<{ settings: TestSettings; tests: TestResult[] }>(`/api/projects/${projectId}/ad-tests`).then(setData).catch((e) => setErr(e.message)), [projectId]);
  useEffect(() => {
    load();
  }, [load]);
  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="hint">Liczę wyniki…</p>;
  return (
    <div>
      <form
        className="card row"
        style={{ marginBottom: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await api<{ id: string }>(`/api/projects/${projectId}/ad-tests`, "POST", { angle });
          location.href = `/projects/${projectId}/testy/${r.id}?nowa=1`;
        }}
      >
        <label className="field" style={{ flex: 1 }}>
          Nowy test – kąt reklamy (obietnica)
          <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="np. Amerykański coach" required />
        </label>
        <button className="btn primary" style={{ alignSelf: "end" }}>Załóż test</button>
      </form>
      {!data.settings.productMatch.length && (
        <p className="warn">Ustaw produkt główny w „Ustawieniach testów” – inaczej koszt kursanta liczy wszystkie zamówienia.</p>
      )}
      <div className="grid">
        {data.tests.map((t) => (
          <Link key={t.id} href={`/projects/${projectId}/testy/${t.id}`} className="card link test-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>{t.angle}</h3>
              <span className={`badge st-${t.status.replace(" ", "-")}`}>{t.status}</span>
            </div>
            <div className="meta">
              {t.current ? `Runda ${t.current.number}: ${t.current.element} · ${t.current.variants.length} warianty` : "Bez rund – dodaj pierwszą"}
            </div>
            <div className="test-kpis">
              <span><span className="hint">Najlepszy CAC</span> <b>{zl(t.current?.bestCac)}</b></span>
              <span>
                <span className="hint">Werdykt</span>{" "}
                <b>{t.current?.daysToVerdict == null ? "—" : t.current.daysToVerdict <= 0 ? "teraz" : `za ${t.current.daysToVerdict} dn.`}</b>
              </span>
            </div>
            {t.alarms.length > 0 && <div className="test-alarm">⚠ {t.alarms.length} {t.alarms.length === 1 ? "alarm" : "alarmy"}: {t.alarms[0]}</div>}
          </Link>
        ))}
      </div>
      {!data.tests.length && <p className="hint">Brak testów. Załóż pierwszy powyżej – potem dodasz rundę z wariantami.</p>}
    </div>
  );
}

function Library({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<{ id: string; angle: string; element: string; change_to: string; idea_source: string; cac: number | null; ctr: number | null; diff_vs_base: number | null; won_at: string; test_id: string | null }[] | null>(null);
  const [angle, setAngle] = useState("");
  const [element, setElement] = useState("");
  useEffect(() => {
    api<typeof rows>(`/api/projects/${projectId}/winning-elements`).then(setRows).catch(() => setRows([]));
  }, [projectId]);
  if (!rows) return <p className="hint">Wczytuję…</p>;
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
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Kąt</th><th>Element</th><th>Na co</th><th>Źródło pomysłu</th><th className="num">CAC</th><th className="num">CTR</th><th className="num">vs baza</th><th>Wygrał</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.test_id ? <Link href={`/projects/${projectId}/testy/${r.test_id}`}>{r.angle}</Link> : r.angle}</td>
                <td>{r.element}</td>
                <td>{r.change_to}</td>
                <td className="hint">{r.idea_source}</td>
                <td className="num">{zl(r.cac)}</td>
                <td className="num">{pct(r.ctr, 2)}</td>
                <td className="num">{r.diff_vs_base == null ? "—" : pct(r.diff_vs_base, 0)}</td>
                <td>{new Date(r.won_at).toLocaleDateString("pl-PL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="hint">Brak zwycięzców{rows.length ? " dla tych filtrów" : ""}.</p>}
    </div>
  );
}

const FIELDS: { key: keyof TestSettings; label: string; help: string; kind: "zl" | "pct" | "int" | "num" | "text" }[] = [
  { key: "goal", label: "Cel testów", help: "Co liczymy jako sukces, np. „zakup kursu”.", kind: "text" },
  { key: "cacMax", label: "Maksymalny koszt kursanta (CAC)", help: "Ile maksymalnie możesz zapłacić za jednego kupującego. Zwycięzca musi być poniżej.", kind: "zl" },
  { key: "budgetPerVariant", label: "Budżet na wariant do werdyktu", help: "Puste = 2 × maksymalny CAC. Po wydaniu tej kwoty aplikacja podpowiada decyzję.", kind: "zl" },
  { key: "loseCac", label: "CAC przegranej", help: "Powyżej tej kwoty wariant przegrywa od razu.", kind: "zl" },
  { key: "minWinDiff", label: "Minimalna różnica do zwycięstwa", help: "Mniejsza różnica CAC niż ta = remis (zostaje wariant z wyższym CTR).", kind: "pct" },
  { key: "variantsPerRound", label: "Wariantów w rundzie", help: "Zwykle 2–4.", kind: "int" },
  { key: "attributionDays", label: "Okno przypisania zakupu (dni)", help: "Zakup liczy się wariantowi, jeśli klient wszedł z jego linku najpóźniej tyle dni wcześniej.", kind: "int" },
  { key: "fatigueCtrDrop", label: "Zmęczenie: spadek CTR", help: "Alarm, gdy tygodniowy CTR zwycięzcy spadnie o tyle względem 1. tygodnia.", kind: "pct" },
  { key: "fatigueCostMult", label: "Zmęczenie: wzrost CAC (×)", help: "Alarm, gdy tygodniowy CAC wzrośnie tyle razy względem 1. tygodnia.", kind: "num" },
  { key: "scaleDays", label: "Skalowanie: dni z dobrym CAC", help: "Po tylu dniach z CAC ≤ maksymalnego aplikacja podpowie zwiększenie budżetu.", kind: "int" },
  { key: "scaleStep", label: "Skalowanie: o ile zwiększyć", help: "Podpowiadany krok zwiększenia budżetu.", kind: "pct" },
  { key: "namingPattern", label: "Wzór nazwy reklamy", help: "{KAT} = kąt, {n} = numer rundy, {WARIANT} = litera.", kind: "text" },
];

function TestSettingsForm({ projectId }: { projectId: string }) {
  const [all, setAll] = useState<ProjectSettings | null>(null);
  const [s, setS] = useState<TestSettings>(DEFAULT_TEST_SETTINGS);
  const [products, setProducts] = useState<{ name: string; count: number }[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<ProjectSettings>(`/api/projects/${projectId}/settings`).then((x) => {
      setAll(x);
      setS(mergeTestSettings(x.adTests));
    });
    api<{ name: string; count: number }[]>(`/api/projects/${projectId}/products`).then(setProducts).catch(() => {});
  }, [projectId]);
  if (!all) return <p className="hint">Wczytuję…</p>;
  const set = (k: keyof TestSettings, v: unknown) => setS((x) => ({ ...x, [k]: v }));
  const sel = new Set(s.productMatch);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await api(`/api/projects/${projectId}/settings`, "PUT", { ...all, adTests: s });
        setMsg("Zapisano – wyniki testów przeliczą się z nowymi progami.");
      }}
    >
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Produkt główny (co liczymy jako „kursanta”)</h3>
        <p className="hint">Zaznacz produkty z zamówień tego projektu. Koszt kursanta = wydatki wariantu ÷ zamówienia z tymi produktami.</p>
        <input placeholder="Szukaj produktu…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
        <div className="picker-list">
          {[...products, ...s.productMatch.filter((p) => !products.some((x) => x.name === p)).map((name) => ({ name, count: 0 }))]
            .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
            .map((p) => (
              <label key={p.name} className={sel.has(p.name) ? "on" : ""}>
                <input type="checkbox" checked={sel.has(p.name)} onChange={() => set("productMatch", sel.has(p.name) ? s.productMatch.filter((x) => x !== p.name) : [...s.productMatch, p.name])} />
                <span className="picker-name">{p.name}</span>
                <span className="hint">{p.count ? `${p.count} szt.` : ""}</span>
              </label>
            ))}
          {!products.length && <span className="hint">Brak zamówień w projekcie – podłącz sklep w „Źródłach danych”.</span>}
        </div>
      </div>
      <div className="card">
        <h3>Progi i reguły</h3>
        <div className="settings-grid">
          {FIELDS.map((f) => {
            const v = s[f.key] as number | string | null;
            return (
              <label key={f.key} className="field">
                {f.label}
                {f.kind === "text" ? (
                  <input value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input
                    type="number"
                    step={f.kind === "pct" ? 1 : f.kind === "num" ? 0.1 : 1}
                    value={v == null ? "" : f.kind === "pct" ? Math.round(Number(v) * 100) : Number(v)}
                    placeholder={f.key === "budgetPerVariant" ? `auto: ${budgetPerVariant({ ...s, budgetPerVariant: null })}` : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return set(f.key, f.key === "budgetPerVariant" ? null : 0);
                      set(f.key, f.kind === "pct" ? Number(raw) / 100 : Number(raw));
                    }}
                  />
                )}
                <span className="hint">{f.help}{f.kind === "pct" ? " (w %)" : ""}</span>
              </label>
            );
          })}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
          {msg && <span className="hint">{msg}</span>}
          <button className="btn primary">Zapisz ustawienia</button>
        </div>
      </div>
    </form>
  );
}
