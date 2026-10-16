import Link from "next/link";
import { CircleAlert, CircleCheck, CircleDashed, Code2, Megaphone, Receipt, ShoppingCart, Wallet, Wrench, type LucideIcon } from "lucide-react";
import type { SourceStatus as S } from "@/lib/dashboard";

const SRC_ICONS: Record<string, LucideIcon> = { script: Code2, meta: Megaphone, woocommerce: ShoppingCart, orders: Receipt, ads: Wallet };
const STATE_ICONS: Record<string, LucideIcon> = { ok: CircleCheck, warn: CircleAlert, off: CircleDashed };
const STATE_LABEL: Record<string, string> = { ok: "działa", warn: "problem", off: "brak" };

/** Stan źródeł danych jako kafelki z ikonami (opis tylko przy problemie). */
export function SourceStatus({ projectId, sources }: { projectId: string; sources: S[] }) {
  return (
    <section className="section" style={{ marginTop: 0 }}>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <span className="src-legend">
          <span className="s-ok"><CircleCheck size={14} /> działa</span>
          <span className="s-warn"><CircleAlert size={14} /> problem</span>
          <span className="s-off"><CircleDashed size={14} /> brak</span>
        </span>
      </div>
      <div className="src-grid">
        {sources.map((s) => {
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
                <Link className="src-fix" href={`/projects/${projectId}/${s.fix}`}><Wrench size={13} /> Napraw</Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
