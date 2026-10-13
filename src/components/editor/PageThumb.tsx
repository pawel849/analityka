// Własne, uproszczone makiety stron do trybu planowania (rysowane w SVG, bez zewnętrznych grafik).
const W = 168;
const H = 96;

type Variant = "form" | "video" | "order" | "calendar" | "check" | "survey" | "article" | "members" | "popup" | "sales" | "download" | "generic";

const VARIANT: Record<string, Variant> = {
  optin: "form",
  landing: "form",
  webinar_reg: "form",
  download: "download",
  vsl: "video",
  webinar: "video",
  replay: "video",
  checkout: "order",
  booking: "calendar",
  thankyou: "check",
  application: "survey",
  blog: "article",
  members: "members",
  popup: "popup",
  sales: "sales",
  upsell: "sales",
  downsell: "sales",
  oto: "sales",
  home: "generic",
  page_custom: "generic",
};

function Lines({ x, y, w, n, gap = 6 }: { x: number; y: number; w: number; n: number; gap?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x} y={y + i * gap} width={i === n - 1 ? w * 0.6 : w} height={2} rx={1} className="pt-line" />
      ))}
    </>
  );
}

function Button({ x, y, w, label }: { x: number; y: number; w: number; label: string }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={10} rx={2} className="pt-accent" />
      <text x={x + w / 2} y={y + 7.2} textAnchor="middle" className="pt-btn-text">{label}</text>
    </>
  );
}

function Media({ x, y, w, h, play }: { x: number; y: number; w: number; h: number; play?: boolean }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={2} className="pt-box" />
      {play ? (
        <path d={`M${cx - 4} ${cy - 5} L${cx + 5} ${cy} L${cx - 4} ${cy + 5} Z`} className="pt-stroke" />
      ) : (
        <path d={`M${x + 4} ${y + h - 4} L${x + w * 0.35} ${y + h * 0.45} L${x + w * 0.55} ${y + h * 0.7} L${x + w * 0.7} ${y + h * 0.55} L${x + w - 4} ${y + h - 4}`} className="pt-stroke" />
      )}
    </>
  );
}

function Body({ v }: { v: Variant }) {
  switch (v) {
    case "form":
      return (
        <>
          <Lines x={44} y={22} w={80} n={2} />
          <rect x={44} y={38} width={80} height={8} rx={2} className="pt-box" />
          <rect x={44} y={50} width={80} height={8} rx={2} className="pt-box" />
          <Button x={44} y={64} w={80} label="ZAPISZ SIĘ" />
        </>
      );
    case "download":
      return (
        <>
          <circle cx={84} cy={36} r={11} className="pt-box" />
          <path d="M84 30 V41 M79 37 L84 42 L89 37" className="pt-stroke" />
          <Lines x={44} y={54} w={80} n={2} />
          <Button x={44} y={68} w={80} label="POBIERZ" />
        </>
      );
    case "video":
      return (
        <>
          <Lines x={44} y={20} w={80} n={1} />
          <Media x={36} y={28} w={96} h={40} play />
          <Button x={52} y={74} w={64} label="KUPUJĘ" />
        </>
      );
    case "order":
      return (
        <>
          <Media x={12} y={22} w={40} h={30} />
          <Lines x={58} y={24} w={96} n={4} />
          <rect x={12} y={58} width={68} height={7} rx={2} className="pt-box" />
          <rect x={86} y={58} width={68} height={7} rx={2} className="pt-box" />
          <Button x={12} y={72} w={142} label="ZAMAWIAM" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x={40} y={20} width={88} height={10} rx={1} className="pt-accent" />
          {Array.from({ length: 20 }, (_, i) => (
            <rect key={i} x={40 + (i % 5) * 17.6} y={32 + Math.floor(i / 5) * 12} width={16} height={10} className={i === 13 ? "pt-accent" : "pt-box"} />
          ))}
        </>
      );
    case "check":
      return (
        <>
          <circle cx={84} cy={40} r={14} className="pt-box" />
          <path d="M77 40 L82 45 L91 35" className="pt-stroke" />
          <Lines x={44} y={60} w={80} n={1} />
          <Button x={52} y={70} w={64} label="DALEJ" />
        </>
      );
    case "survey":
      return (
        <>
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i}>
              <rect x={30} y={22 + i * 9} width={5} height={5} className={i === 1 ? "pt-accent" : "pt-box"} />
              <rect x={40} y={23.5 + i * 9} width={90 - (i % 2) * 20} height={2} rx={1} className="pt-line" />
            </g>
          ))}
          <Button x={30} y={70} w={108} label="WYŚLIJ" />
        </>
      );
    case "article":
      return (
        <>
          <Media x={30} y={20} w={108} h={28} />
          <Lines x={30} y={54} w={108} n={5} gap={5} />
        </>
      );
    case "members":
      return (
        <>
          <circle cx={30} cy={32} r={9} className="pt-box" />
          <Lines x={46} y={26} w={60} n={2} />
          {Array.from({ length: 3 }, (_, i) => (
            <rect key={i} x={14 + i * 49} y={48} width={44} height={30} rx={2} className="pt-box" />
          ))}
        </>
      );
    case "popup":
      return (
        <>
          <Lines x={14} y={22} w={140} n={8} gap={7} />
          <rect x={40} y={28} width={88} height={52} rx={3} className="pt-modal" />
          <Lines x={52} y={38} w={64} n={2} />
          <Button x={52} y={62} w={64} label="TAK!" />
        </>
      );
    case "sales":
      return (
        <>
          <Lines x={36} y={20} w={96} n={1} />
          <Media x={36} y={28} w={96} h={28} />
          <Lines x={36} y={62} w={96} n={1} />
          <Button x={52} y={72} w={64} label="KUPUJĘ" />
        </>
      );
    default:
      return (
        <>
          <Media x={36} y={20} w={96} h={30} />
          <Lines x={36} y={56} w={96} n={4} gap={6} />
        </>
      );
  }
}

export function PageThumb({ kind }: { kind: string }) {
  const v = VARIANT[kind] ?? "generic";
  return (
    <svg className="pthumb" viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={4} className="pt-frame" />
      <rect x={0.5} y={0.5} width={W - 1} height={12} rx={4} className="pt-bar" />
      <circle cx={8} cy={6.5} r={1.8} className="pt-dot" />
      <circle cx={14} cy={6.5} r={1.8} className="pt-dot" />
      <circle cx={20} cy={6.5} r={1.8} className="pt-dot" />
      <rect x={30} y={4} width={70} height={5} rx={2.5} className="pt-addr" />
      <Body v={v} />
    </svg>
  );
}
