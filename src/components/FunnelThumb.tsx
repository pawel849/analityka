import { CATEGORY_GREEN } from "@/lib/palette";

/** Miniatura mapy lejka (SVG z pozycji elementów) – do listy map, bez ładowania edytora. */

interface TNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  style?: { width?: number | string; height?: number | string };
  data?: { category?: string; label?: string };
}
interface TEdge {
  source: string;
  target: string;
}

const COLORS: Record<string, string> = CATEGORY_GREEN;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && Number.isFinite(parseFloat(v)) ? parseFloat(v) : undefined);

export function FunnelThumb({ graph }: { graph: { nodes?: TNode[]; edges?: TEdge[] } | null }) {
  const nodes = (graph?.nodes ?? []).filter((n) => n.position);
  if (!nodes.length) return <div className="thumb-empty">Pusta mapa</div>;
  const box = (n: TNode) => {
    const funnel = n.type === "funnel" || !n.type;
    const w = num(n.measured?.width) ?? num(n.width) ?? num(n.style?.width) ?? (funnel ? 190 : 160);
    const h = num(n.measured?.height) ?? num(n.height) ?? num(n.style?.height) ?? (funnel ? 78 : 40);
    return { x: n.position!.x, y: n.position!.y, w, h };
  };
  const boxes = new Map(nodes.map((n) => [n.id, box(n)]));
  const all = [...boxes.values()];
  const pad = 60;
  const minX = Math.min(...all.map((b) => b.x)) - pad;
  const minY = Math.min(...all.map((b) => b.y)) - pad;
  const maxX = Math.max(...all.map((b) => b.x + b.w)) + pad;
  const maxY = Math.max(...all.map((b) => b.y + b.h)) + pad;
  return (
    <svg className="thumb-svg" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {(graph?.edges ?? []).map((e, i) => {
        const a = boxes.get(e.source);
        const b = boxes.get(e.target);
        if (!a || !b) return null;
        const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
        const dx = Math.max(40, Math.abs(x2 - x1) / 2);
        return <path key={i} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} fill="none" stroke="#5d6b64" strokeWidth={4} />;
      })}
      {nodes.map((n) => {
        const b = boxes.get(n.id)!;
        const cat = n.data?.category;
        if (n.type === "text") return <rect key={n.id} x={b.x} y={b.y + b.h / 2 - 8} width={Math.min(b.w, 220)} height={16} rx={8} fill="#c9ced6" />;
        if (n.type && n.type !== "funnel") return <rect key={n.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill="none" stroke="#d5d9e0" strokeWidth={4} strokeDasharray="12 10" />;
        const c = COLORS[cat ?? ""] ?? "#7b8392";
        return (
          <g key={n.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill="#18201c" stroke={c} strokeWidth={5} />
            <rect x={b.x} y={b.y} width={b.w} height={18} rx={9} fill={c} />
            <rect x={b.x + 18} y={b.y + 36} width={b.w * 0.6} height={12} rx={6} fill="#2a3530" />
          </g>
        );
      })}
    </svg>
  );
}
