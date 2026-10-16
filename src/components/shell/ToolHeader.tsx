import { TOOL_BY_KEY, type ToolKey } from "@/lib/nav";

/** Ten sam nagłówek w każdym narzędziu: nazwa, do czego służy, jak używać (rozwijane). */
export function ToolHeader({ tool, context, actions }: { tool: ToolKey; context: string; actions?: React.ReactNode }) {
  const t = TOOL_BY_KEY[tool];
  return (
    <header className="tool-head">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{t.label}</h1>
          <p className="tool-what">{t.what}</p>
        </div>
        {actions}
      </div>
      <details className="tool-how">
        <summary>Jak używać</summary>
        <ol>
          {t.how.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </details>
      <div className="tool-context">Dane: <b>{context}</b></div>
    </header>
  );
}
