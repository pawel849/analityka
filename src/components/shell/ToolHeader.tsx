import { TOOL_BY_KEY, type ToolKey } from "@/lib/nav";

/** Nagłówek narzędzia: sama nazwa (+ opcjonalne akcje). Opis i instrukcja są w pomocy „?”. */
export function ToolHeader({ tool, actions }: { tool: ToolKey; context?: string; actions?: React.ReactNode }) {
  return (
    <header className="tool-head">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>{TOOL_BY_KEY[tool].label}</h1>
        {actions}
      </div>
    </header>
  );
}
