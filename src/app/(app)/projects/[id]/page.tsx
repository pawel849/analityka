import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SetupChoice } from "@/components/setup/SetupWizard";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { dashboard } from "@/lib/dashboard";
import { LEGACY_TABS, TOOLS, projectHref } from "@/lib/nav";
import { loadProject } from "@/lib/project-context";

const money = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("pl-PL")} zł`);
const int = (v: number) => v.toLocaleString("pl-PL");

function Change({ now, prev, invert = false }: { now: number | null; prev: number | null; invert?: boolean }) {
  if (now == null || prev == null || !prev) return <span className="hint">brak porównania</span>;
  const d = now / prev - 1;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={`kpi-delta ${Math.abs(d) < 0.005 ? "" : good ? "up" : "down"}`}>
      {d >= 0 ? "+" : "−"}
      {Math.abs(d * 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 })}% vs poprz. 30 dni
    </span>
  );
}

/** Pulpit projektu (+ przekierowanie starych adresów ?tab=…). */
export default async function ProjectHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  if (tab && LEGACY_TABS[tab]) redirect(projectHref(id, LEGACY_TABS[tab]) + (tab === "integracje" ? "?s=api" : ""));
  const project = await loadProject(id);
  if (!project) notFound();
  const d = await dashboard(id);
  const k = d.kpis;
  const missing = d.sources.filter((s) => s.state !== "ok");

  return (
    <>
      <ToolHeader tool="pulpit" context={`${project.client_name} · ${project.name}${project.domain ? ` (${project.domain})` : ""}`} />

      {!project.setup.mode && (
        <section className="section">
          <h2>Jak chcesz zacząć?</h2>
          <SetupChoice projectId={id} />
        </section>
      )}

      <section className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Ostatnie 30 dni</h2>
          <span className="hint">cały projekt: wszystkie kampanie i produkty · {d.range.from} – {d.range.to}</span>
        </div>
        <div className="kpi-row" style={{ marginTop: 10 }}>
          <div className="kpi"><span className="hint">Przychód (zamówienia)</span><b>{money(k.revenue.now)}</b><Change now={k.revenue.now} prev={k.revenue.prev} /></div>
          <div className="kpi"><span className="hint">Wydatki na reklamy</span><b>{money(k.spend.now)}</b><Change now={k.spend.now} prev={k.spend.prev} invert /></div>
          <div className="kpi"><span className="hint">ROAS (przychód ÷ wydatki)</span><b>{k.roas.now == null ? "—" : `${k.roas.now.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}×`}</b><Change now={k.roas.now} prev={k.roas.prev} /></div>
          <div className="kpi"><span className="hint">Zamówienia</span><b>{int(k.orders.now)}</b><Change now={k.orders.now} prev={k.orders.prev} /></div>
          <div className="kpi"><span className="hint">Odwiedzający strony</span><b>{int(k.visitors.now)}</b><Change now={k.visitors.now} prev={k.visitors.prev} /></div>
        </div>
      </section>

      <section className="section">
        <h2>Skąd są dane</h2>
        {missing.length > 0 && <p className="hint">Szare i żółte punkty = brak lub problem z danymi. Kliknij „Napraw”, żeby zobaczyć instrukcję.</p>}
        <div className="src-list">
          {d.sources.map((s) => (
            <div key={s.key} className={`src-item s-${s.state}`}>
              <span className="src-dot" />
              <div>
                <b>{s.label}</b>
                <div className="hint">{s.detail}</div>
              </div>
              {s.state !== "ok" && s.fix && <Link className="btn small" href={`/projects/${id}/${s.fix}`}>Napraw</Link>}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Narzędzia</h2>
        <div className="tool-cards">
          {TOOLS.filter((t) => t.section === "narzedzia").map((t) => (
            <Link key={t.key} href={projectHref(id, t.key)} className="tool-card">
              <b>{t.label}</b>
              <span>{t.what}</span>
              <span className="tool-card-meta">
                {t.key === "lejki" ? `${d.counts.funnels} ${d.counts.funnels === 1 ? "lejek" : "lejków"}` : t.key === "testy" ? `${d.counts.activeTests} aktywnych testów` : "Otwórz →"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
