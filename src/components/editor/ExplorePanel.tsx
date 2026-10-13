"use client";
import { useCallback, useEffect, useState } from "react";
import type { NodeData } from "@/lib/catalog";
import { api } from "../forms";

interface Row {
  value: string;
  people: number;
}
interface ExploreData {
  eventCount: number;
  pages: Row[];
  sources: Row[];
  campaigns: Row[];
  events: Row[];
}

const EVENT_LABELS: Record<string, string> = {
  click: "Kliknięcie",
  lead: "Zapis (lead)",
  form_submit: "Wysłanie formularza",
  purchase: "Zakup",
  add_to_cart: "Dodanie do koszyka",
  video_play: "Odtworzenie wideo",
  booking: "Umówione spotkanie",
};

const EVENT_KIND: Record<string, string> = {
  click: "click",
  lead: "lead",
  form_submit: "form_submit",
  purchase: "purchase",
  add_to_cart: "add_to_cart",
  video_play: "video_play",
  booking: "booking_done",
};

export function ExplorePanel({
  funnelId,
  trackingKey,
  range,
  onAdd,
}: {
  funnelId: string;
  trackingKey: string;
  range: { from: string; to: string };
  onAdd: (kind: string, patch: Partial<NodeData>) => void;
}) {
  const [data, setData] = useState<ExploreData | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const snippet = `<script async src="${origin}/t.js" data-key="${trackingKey}"></script>`;

  const load = useCallback(() => {
    setErr("");
    api<ExploreData>(`/api/funnels/${funnelId}/explore?from=${range.from}&to=${range.to}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [funnelId, range.from, range.to]);
  useEffect(load, [load]);

  const section = (title: string, rows: Row[], add: (r: Row) => void, fmt: (v: string) => string = (v) => v) => (
    <div className="explore-sec">
      <h4>{title}</h4>
      {rows.length === 0 && <div className="hint">Brak danych w zakresie.</div>}
      {rows.map((r) => (
        <div className="explore-row" key={r.value}>
          <span title={r.value}>{fmt(r.value)}</span>
          <span className="hint">{r.people}</span>
          <button className="btn small" title="Dodaj na mapę" onClick={() => add(r)}>+</button>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <h4>Skrypt śledzący</h4>
      <p className="hint">Wklej przed &lt;/head&gt; na każdej stronie lejka.</p>
      <pre
        className="snippet"
        style={{ cursor: "pointer", fontSize: 10 }}
        title="Kliknij, aby skopiować"
        onClick={() => navigator.clipboard.writeText(snippet).then(() => setCopied(true))}
      >
        {snippet}
      </pre>
      {copied && <div className="hint">Skopiowano do schowka</div>}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <span className="hint">
          Dane z zakresu {range.from} – {range.to}
          {data ? ` · zdarzeń: ${data.eventCount}` : ""}
        </span>
        <button className="btn small" onClick={load}>Odśwież</button>
      </div>
      {err && <div className="error">{err}</div>}
      {data && (
        <>
          {section("Strony (osoby)", data.pages, (r) => onAdd("page_custom", { label: r.value, url: r.value }))}
          {section("Źródła", data.sources, (r) => onAdd("source_custom", { label: r.value, sourceMatch: r.value }))}
          {section("Kampanie (utm_campaign)", data.campaigns, (r) =>
            onAdd("source_custom", {
              label: r.value,
              sourceMatch: "",
              filters: [{ key: "utm_campaign", op: "eq", value: r.value }],
            }),
          )}
          {section(
            "Zdarzenia",
            data.events,
            (r) => {
              if (r.value.startsWith("custom:")) onAdd("action_custom", { label: r.value.slice(7), eventType: "custom", eventName: r.value.slice(7) });
              else onAdd(EVENT_KIND[r.value] ?? "action_custom", { eventType: r.value });
            },
            (v) => (v.startsWith("custom:") ? `Własne: ${v.slice(7)}` : EVENT_LABELS[v] ?? v),
          )}
        </>
      )}
    </div>
  );
}
