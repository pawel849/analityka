import { CircleHelp } from "lucide-react";

/** Znak zapytania z dymkiem po najechaniu (zamiast stałych opisów na stronie). */
export function Tip({ text }: { text: string }) {
  return (
    <span className="tip" tabIndex={0} aria-label={text}>
      <CircleHelp size={16} />
      <span className="tip-box" role="tooltip">{text}</span>
    </span>
  );
}
