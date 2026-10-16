import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, CircleAlert, CircleCheck, CircleDashed, Code2, Megaphone, Minus, Receipt, ShoppingCart, Target, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SetupChoice } from "@/components/setup/SetupWizard";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { TOOL_ICONS } from "@/components/shell/tool-icons";
import { dashboard } from "@/lib/dashboard";
import { LEGACY_TABS, TOOLS, projectHref } from "@/lib/nav";
import { loadProject } from "@/lib/project-context";

const money = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("pl-PL")} zł`);
const int = (v: number) => v.toLocaleString("pl-PL");
const pl = (d: string) => d.split("-").reverse().join(".");

function Change({ now, prev, invert = false, vs }: { now: number | null; prev: number | null; invert?: boolean; vs: string }) {
  if (now == null || prev == null || !prev) return <span className="kpi-delta" title={`brak danych do porównania (${vs})`}><Minus size={13} /> brak porównania</span>;
  const d = now / prev - 1;
  const flat = Math.abs(d) < 0.005;
  const good = invert ? d < 0 : d > 0;
  const Arrow = flat ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`kpi-delta ${flat ? "" : good ? "up" : "down"}`} title={`zmiana ${vs}`}>
      <Arrow size={13} />
      {Math.abs(d * 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 })}%
    </span>
  );
}

function Kpi({ icon: Icon, tone, label, value, children }: { icon: LucideIcon; tone: string; label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="kpi2">
      <span className={`kpi2-icon t-${tone}`}><Icon size={18} /></span>
      <span className="kpi2-label">{label}</span>
      <b className="kpi2-value">{value}</b>
      {children}
    </div>
  );
}

const SRC_ICONS: Record<string, LucideIcon> = { script: Code2, meta: Megaphone, woocommerce: ShoppingCart, orders: Receipt, ads: Wallet };
const STATE_ICONS: Record<string, LucideIcon> = { ok: CircleCheck, warn: CircleAlert, off: CircleDashed };
const STATE_LABEL: Record<string, string> = { ok: "działa", warn: "problem", off: "brak" };

/** Pulpit projektu (+ przekierowanie starych adresów ?tab=…). */
export default async function ProjectHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const { id } = await params;
  const { tab, from, to } = await searchParams;
  if (tab && LEGACY_TABS[tab]) redirect(projectHref(id, LEGACY_TABS[tab]) + (tab === "integracje" ? "?s=api" : ""));
  const project = await loadProject(id);
  if (!project) notFound();
  const d = await dashboard(id, from, to);
  const r = d.range;
  const vs = `vs ${pl(r.pFrom)} – ${pl(r.pTo)}`;
  const k = d.kpis;

  return (
    <>
      {!project.setup.mode && (
        <section className="section">
          <h2>Jak chcesz zacząć?</h2>
          <SetupChoice projectId={id} />
        </section>
      )}

      <section className="section">
        <div className="dash-head">
          <h2 style={{ margin: 0 }}>Wyniki</h2>
          <RangePicker from={r.from} to={r.to} days={r.days} />
        </div>
        <p className="hint" style={{ margin: "6px 0 0" }}>Strzałka = zmiana {vs} (poprzedni okres tej samej długości).</p>
        <div className="kpi2-row">
          <Kpi icon={Banknote} tone="green" label="Przychód" value={money(k.revenue.now)}><Change now={k.revenue.now} prev={k.revenue.prev} vs={vs} /></Kpi>
          <Kpi icon={Wallet} tone="orange" label="Wydatki na reklamy" value={money(k.spend.now)}><Change now={k.spend.now} prev={k.spend.prev} invert vs={vs} /></Kpi>
          <Kpi icon={Target} tone="blue" label="ROAS" value={k.roas.now == null ? "—" : `${k.roas.now.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}×`}><Change now={k.roas.now} prev={k.roas.prev} vs={vs} /></Kpi>
          <Kpi icon={Receipt} tone="violet" label="Zamówienia" value={int(k.orders.now)}><Change now={k.orders.now} prev={k.orders.prev} vs={vs} /></Kpi>
          <Kpi icon={Users} tone="teal" label="Odwiedzający" value={int(k.visitors.now)}><Change now={k.visitors.now} prev={k.visitors.prev} vs={vs} /></Kpi>
        </div>
      </section>

      <section className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Skąd są dane</h2>
          <span className="src-legend">
            <span className="s-ok"><CircleCheck size={14} /> działa</span>
            <span className="s-warn"><CircleAlert size={14} /> problem</span>
            <span className="s-off"><CircleDashed size={14} /> brak</span>
          </span>
        </div>
        <div className="src-grid">
          {d.sources.map((s) => {
            const Icon = SRC_ICONS[s.key] ?? Code2;
            const State = STATE_ICONS[s.state];
            return (
              <div key={s.key} className={`src-tile s-${s.state}`} title={s.detail}>
                <span className="src-tile-icon">
                  <Icon size={20} />
                  <span className="src-tile-badge" aria-label={STATE_LABEL[s.state]}><State size={15} /></span>
                </span>
                <b>{s.label}</b>
                {s.state !== "ok" && <span className="src-tile-detail">{s.detail}</span>}
                {s.state !== "ok" && s.fix && (
                  <Link className="src-fix" href={`/projects/${id}/${s.fix}`}><Wrench size={13} /> Napraw</Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Narzędzia</h2>
        <div className="tool-tiles">
          {TOOLS.filter((t) => t.section === "narzedzia").map((t) => {
            const Icon = TOOL_ICONS[t.key];
            return (
              <Link key={t.key} href={projectHref(id, t.key)} className="tool-tile" title={t.what}>
                <span className="tool-tile-icon"><Icon size={22} /></span>
                <b>{t.label}</b>
                <ArrowRight size={16} className="tool-tile-go" />
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
