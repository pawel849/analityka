import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TOOL_BY_KEY, type ToolKey } from "@/lib/nav";
import { TOOL_ICONS } from "./tool-icons";

/** Nagłówek narzędzia: strzałka do pulpitu + nazwa (+ opcjonalne akcje). */
export function ToolHeader({ tool, projectId, actions }: { tool: ToolKey; projectId: string; context?: string; actions?: React.ReactNode }) {
  const Icon = TOOL_ICONS[tool];
  return (
    <header className="tool-head">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="tool-title">
          <Link href={`/projects/${projectId}`} className="back-btn" title="Wróć do pulpitu" aria-label="Wróć do pulpitu"><ArrowLeft size={20} /></Link>
          <span className="tool-title-ic"><Icon size={20} /></span>
          <h1>{TOOL_BY_KEY[tool].label}</h1>
        </div>
        {actions}
      </div>
    </header>
  );
}
