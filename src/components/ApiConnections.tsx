"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./forms";

type Provider = "meta" | "woocommerce";

interface Conn {
  id: string;
  provider: Provider;
  name: string;
  config: Record<string, unknown>;
  state: { done?: boolean; cursor?: string };
  status: string;
  last_sync_at: string | null;
  last_error: string;
  last_result: { rows?: number; removed?: number; events?: number; warnings?: string[]; range?: { from: string; to: string }; actionTypes?: string[] };
  enabled: boolean;
  has_secret: boolean;
}

const STATUS: Record<string, string> = { new: "Nie synchronizowano", running: "W toku…", ok: "OK", partial: "Częściowo – dokończy przy następnej synchronizacji", error: "Błąd" };

const LABEL: Record<Provider, string> = { meta: "Meta Ads", woocommerce: "WooCommerce" };

export function ApiConnections({ projectId }: { projectId: string }) {
  const [list, setList] = useState<Conn[]>([]);
  const [adding, setAdding] = useState<Provider | null>(null);
  const [editing, setEditing] = useState<Conn | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api<Conn[]>(`/api/projects/${projectId}/integrations`).then(setList).catch((e) => setError(e.message)), [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  const sync = async (c: Conn) => {
    setBusy(c.id);
    setError("");
    try {
      await api(`/api/projects/${projectId}/integrations/${c.id}/sync`, "POST");
    } catch (e) {
      setError(`${c.name}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      load();
    }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Połączenia API (automatyczny import)</h3>
        <div className="row">
          <button className="btn small" onClick={() => { setEditing(null); setAdding("meta"); }}>+ Meta Ads</button>
          <button className="btn small" onClick={() => { setEditing(null); setAdding("woocommerce"); }}>+ WooCommerce</button>
        </div>
      </div>
      <p className="hint">
        Dane trafiają tam, gdzie import CSV: koszty reklam (mapa – pole „Koszty z importu reklam”, Ekonomia) i zamówienia (Ekonomia, opcjonalnie zakupy na mapie).
        Synchronizacja: przycisk „Synchronizuj teraz” oraz automatycznie raz dziennie (wymaga zmiennej CRON_SECRET na Vercelu). Klucze są zapisywane zaszyfrowane.
      </p>
      {error && <p className="error">{error}</p>}

      {(adding || editing) && (
        <ConnForm
          key={editing?.id ?? adding}
          projectId={projectId}
          provider={(editing?.provider ?? adding)!}
          conn={editing}
          onDone={(saved) => {
            setAdding(null);
            setEditing(null);
            if (saved) load();
          }}
        />
      )}

      {!list.length && !adding && <p className="hint">Brak połączeń.</p>}
      {list.map((c) => (
        <div key={c.id} className="conn">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <b>{c.name}</b> <span className="badge">{LABEL[c.provider]}</span>{" "}
              <span className={`badge ${c.status === "ok" ? "status-ready" : c.status === "error" ? "conn-err" : "status-manual"}`}>{STATUS[c.status] ?? c.status}</span>
              {!c.enabled && <span className="badge">wyłączone z automatu</span>}
            </div>
            <div className="row">
              <button className="btn small primary" disabled={busy === c.id} onClick={() => sync(c)}>{busy === c.id ? "Pobieram…" : "Synchronizuj teraz"}</button>
              <button className="btn small" onClick={() => { setAdding(null); setEditing(c); }}>Edytuj</button>
              <button
                className="btn small danger"
                onClick={async () => {
                  if (!confirm("Usunąć połączenie? Pobrane dane zostaną (wpis „API: …” w Źródła danych → Import plików).")) return;
                  await api(`/api/projects/${projectId}/integrations/${c.id}`, "DELETE");
                  load();
                }}
              >
                Usuń
              </button>
            </div>
          </div>
          <div className="hint">
            {c.last_sync_at ? `Ostatnio: ${new Date(c.last_sync_at).toLocaleString("pl-PL")}` : "Jeszcze nie synchronizowano"}
            {c.last_result?.range && ` · zakres ${c.last_result.range.from} – ${c.last_result.range.to}`}
            {c.last_result?.rows != null && ` · zapisano ${c.last_result.rows} ${c.provider === "meta" ? "wierszy (reklama × dzień)" : "zamówień"}`}
            {!!c.last_result?.removed && ` · usunięto ${c.last_result.removed} (status nieopłacony)`}
            {c.last_result?.events != null && c.provider === "woocommerce" && ` · nowe zakupy na mapie: ${c.last_result.events}`}
          </div>
          {c.last_error && <div className="error">{c.last_error}</div>}
          {c.last_result?.warnings?.map((w, i) => (
            <div key={i} className="warn">{w}</div>
          ))}
          {!!c.last_result?.actionTypes?.length && (
            <details className="hint">
              <summary>Typy akcji zwrócone przez Meta ({c.last_result.actionTypes.length})</summary>
              {c.last_result.actionTypes.join(", ")}
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function ConnForm({ projectId, provider, conn, onDone }: { projectId: string; provider: Provider; conn: Conn | null; onDone: (saved: boolean) => void }) {
  const cfg = conn?.config ?? {};
  const [f, setF] = useState<Record<string, string | boolean>>({
    name: conn?.name ?? "",
    accountId: String(cfg.accountId ?? ""),
    version: String(cfg.version ?? ""),
    site: String(cfg.site ?? ""),
    paidStatuses: String(cfg.paidStatuses ?? ""),
    events: cfg.events !== false,
    days: String(cfg.days ?? 90),
    enabled: conn?.enabled ?? true,
    token: "",
    key: "",
    secret: "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const keyHint = conn ? "Zostaw puste, aby nie zmieniać zapisanego klucza." : "";

  return (
    <form
      className="conn-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setErr("");
        try {
          const data = { provider, ...f, days: Number(f.days) };
          if (conn) await api(`/api/projects/${projectId}/integrations/${conn.id}`, "PATCH", data);
          else await api(`/api/projects/${projectId}/integrations`, "POST", data);
          onDone(true);
        } catch (e2) {
          setErr((e2 as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h4 style={{ margin: "0 0 8px" }}>{conn ? "Edycja" : "Nowe połączenie"}: {LABEL[provider]}</h4>
      <div className="map-grid">
        <label className="field">Nazwa (opcjonalnie)<input value={String(f.name)} onChange={set("name")} placeholder={provider === "meta" ? "np. Konto reklamowe klienta" : "np. Sklep klienta"} /></label>
        {provider === "meta" ? (
          <>
            <label className="field">ID konta reklamowego<input required value={String(f.accountId)} onChange={set("accountId")} placeholder="np. 1234567890 (bez act_)" /></label>
            <label className="field">Token dostępu (ads_read)<input type="password" autoComplete="off" required={!conn} value={String(f.token)} onChange={set("token")} placeholder={keyHint || "EAAG…"} /></label>
            <label className="field">Wersja API<input value={String(f.version)} onChange={set("version")} placeholder="v26.0" /></label>
          </>
        ) : (
          <>
            <label className="field">Adres sklepu<input required value={String(f.site)} onChange={set("site")} placeholder="https://sklep.pl" /></label>
            <label className="field">Consumer key<input type="password" autoComplete="off" required={!conn} value={String(f.key)} onChange={set("key")} placeholder={keyHint || "ck_…"} /></label>
            <label className="field">Consumer secret<input type="password" autoComplete="off" required={!conn} value={String(f.secret)} onChange={set("secret")} placeholder={keyHint || "cs_…"} /></label>
            <label className="field">Statusy opłacone (po przecinku)<input value={String(f.paidStatuses)} onChange={set("paidStatuses")} placeholder="processing,completed" /></label>
          </>
        )}
        <label className="field">Pierwsze pobranie: ostatnie dni<input type="number" min={1} max={1095} value={String(f.days)} onChange={set("days")} /></label>
      </div>
      {provider === "woocommerce" && (
        <label className="row hint" style={{ gap: 6, marginTop: 6 }}>
          <input type="checkbox" checked={!!f.events} onChange={set("events")} /> Dodawaj opłacone zamówienia jako zakupy na mapie lejka (wyłącz, jeśli strona podziękowania ma już anl(&quot;purchase&quot;) – inaczej zakupy policzą się dwa razy)
        </label>
      )}
      {conn && (
        <label className="row hint" style={{ gap: 6, marginTop: 6 }}>
          <input type="checkbox" checked={!!f.enabled} onChange={set("enabled")} /> Synchronizuj automatycznie raz dziennie
        </label>
      )}
      <details className="hint" style={{ marginTop: 6 }}>
        <summary>Skąd wziąć dane dostępowe?</summary>
        {provider === "meta" ? (
          <ol>
            <li>ID konta: Menedżer reklam → adres strony zawiera <code>act=1234567890</code> (same cyfry).</li>
            <li>Token: Business Manager → Ustawienia firmy → Użytkownicy → Użytkownicy systemowi → dodaj użytkownika, przypisz mu konto reklamowe, „Wygeneruj token” z uprawnieniem <code>ads_read</code> (potrzebna jest aplikacja Meta for Developers podpięta do firmy).</li>
            <li>Nie sprawdzałem, czy Meta wymaga do tego weryfikacji aplikacji – jeśli token zwróci błąd uprawnień, komunikat Meta pojawi się tutaj.</li>
          </ol>
        ) : (
          <ol>
            <li>WordPress → WooCommerce → Ustawienia → Zaawansowane → REST API → Dodaj klucz.</li>
            <li>Uprawnienia: <b>Odczyt</b>. Skopiuj Consumer key i Consumer secret (widoczne tylko raz).</li>
            <li>Sklep musi działać na https://.</li>
          </ol>
        )}
      </details>
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button type="button" className="btn small" onClick={() => onDone(false)}>Anuluj</button>
        <button className="btn small primary" disabled={saving}>{saving ? "Zapisuję…" : "Zapisz"}</button>
      </div>
    </form>
  );
}
