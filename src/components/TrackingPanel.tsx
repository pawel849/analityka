"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./forms";

interface Ev {
  id: string;
  ts: string;
  type: string;
  name: string;
  path: string;
  utm_source: string;
  element: string;
  value: number | null;
  scroll: number | null;
  is_test: boolean;
}

export function TrackingPanel({
  projectId,
  origin,
  trackingKey,
  funnels,
}: {
  projectId: string;
  origin: string;
  trackingKey: string;
  funnels: { id: string; name: string }[];
}) {
  const snippet = `<script async src="${origin}/t.js" data-key="${trackingKey}"></script>`;
  const [events, setEvents] = useState<Ev[]>([]);
  const [msg, setMsg] = useState("");
  const [funnel, setFunnel] = useState(funnels[0]?.id ?? "");

  const load = useCallback(() => {
    api<Ev[]>(`/api/projects/${projectId}/events`).then(setEvents).catch(() => {});
  }, [projectId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="card">
      <h2>Skrypt śledzący</h2>
      <p className="hint">Wklej przed &lt;/head&gt; na każdej stronie lejka. Zbiera odsłony, źródło (UTM / odsyłacz), kliknięcia, przewinięcie 25/50/75/100%, formularze i odtworzenia wideo HTML5.</p>
      <pre className="snippet">{snippet}</pre>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={() => navigator.clipboard.writeText(snippet).then(() => setMsg("Skopiowano"))}>Kopiuj</button>
        {msg && <span className="hint">{msg}</span>}
      </div>

      <details style={{ marginTop: 14 }}>
        <summary><b>Jak zainstalować</b></summary>
        <ul>
          <li><b>WordPress:</b> wtyczka do wstawiania kodu w nagłówku (np. WPCode → „Header”) albo plik motywu <code>header.php</code>.</li>
          <li><b>MailerLite / GetResponse (landing pages):</b> wklej w ustawieniach strony w polu na własny kod w nagłówku – o ile Twój plan na to pozwala (nie sprawdzałem tego dla każdego planu).</li>
          <li><b>Własny kod:</b> wklej w &lt;head&gt;.</li>
          <li><b>Kilka domen</b> (np. strona na WordPressie → zapis w MailerLite): dodaj <code>data-domains=&quot;druga-domena.pl&quot;</code> – identyfikator osoby zostanie przeniesiony w linkach.</li>
        </ul>
        <b>Zdarzenia wysyłane ręcznie</b> (np. na stronie podziękowania):
        <pre className="snippet">{`<script>
  window.anl = window.anl || function(){ (window.anl.q = window.anl.q || []).push(arguments) };
  anl("lead");                    // zapis
  anl("purchase", 297);           // zakup z kwotą
  anl("event", "webinar_start");  // zdarzenie własne
</script>`}</pre>
        <p className="hint">Linki z reklam oznaczaj parametrami UTM (utm_source=facebook itd.). Bez UTM źródło ustalane jest z odsyłacza, fbclid lub gclid.</p>
      </details>

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Ostatnie zdarzenia</h3>
          <button className="btn small" onClick={load}>Odśwież</button>
        </div>
        {events.length === 0 ? (
          <p className="hint">Brak zdarzeń. Po wklejeniu skryptu otwórz stronę – zdarzenie pojawi się tu w ciągu kilku sekund.</p>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 320 }}>
            <table className="tbl">
              <thead>
                <tr><th>Czas</th><th>Typ</th><th>Ścieżka</th><th>Źródło</th><th>Szczegóły</th></tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.ts).toLocaleString("pl-PL")}</td>
                    <td>{e.type} {e.is_test && <span className="badge">test</span>}</td>
                    <td>{e.path}</td>
                    <td>{e.utm_source || "—"}</td>
                    <td>{[e.name, e.element, e.value != null ? `${e.value} zł` : "", e.scroll != null ? `${e.scroll}%` : ""].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <h3>Dane testowe</h3>
        <p className="hint">Symuluje ruch po mapie wybranego lejka (ok. 400 osób z ostatnich 30 dni), żeby zobaczyć tryb analizy. Dane są oznaczone jako testowe i można je usunąć.</p>
        <div className="row">
          <select value={funnel} onChange={(e) => setFunnel(e.target.value)} disabled={!funnels.length}>
            {funnels.length === 0 && <option>Najpierw utwórz lejek</option>}
            {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button
            className="btn small"
            disabled={!funnel}
            onClick={async () => {
              try {
                const r = await api<{ inserted: number }>(`/api/projects/${projectId}/test-data`, "POST", { funnel_id: funnel });
                setMsg(`Dodano ${r.inserted} zdarzeń testowych`);
                load();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Generuj dane testowe
          </button>
          <button
            className="btn small danger"
            onClick={async () => {
              const r = await api<{ deleted: number }>(`/api/projects/${projectId}/test-data`, "DELETE");
              setMsg(`Usunięto ${r.deleted} zdarzeń testowych`);
              load();
            }}
          >
            Usuń dane testowe
          </button>
        </div>
      </div>
    </div>
  );
}
