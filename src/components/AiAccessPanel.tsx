"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./forms";

interface Key {
  id: string;
  name: string;
  hint: string;
  created_at: string;
  last_used_at: string | null;
}

export function AiAccessPanel({ origin }: { origin: string }) {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("Claude");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const load = useCallback(() => api<Key[]>("/api/ai-keys").then(setKeys).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const copy = (label: string, text: string) => navigator.clipboard.writeText(text).then(() => setCopied(label));
  const connectorUrl = fresh ? `${origin}/api/mcp/${fresh}` : "";
  const cli = fresh ? `claude mcp add --transport http analityka ${origin}/api/mcp --header "Authorization: Bearer ${fresh}"` : "";

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Nowy klucz</h3>
        <p className="hint">Klucz daje asystentowi AI (np. Claude) dostęp do wszystkich klientów i projektów w tej aplikacji – czytanie i uzupełnianie danych. Nie daje dostępu do zapisanych tokenów Meta / kluczy WooCommerce.</p>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await api<{ token: string }>("/api/ai-keys", "POST", { name });
            setFresh(r.token);
            setCopied("");
            load();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa, np. Claude – laptop" />
          <button className="btn primary">Utwórz klucz</button>
        </form>
        {fresh && (
          <div className="wz-box" style={{ marginTop: 12 }}>
            <b>Skopiuj teraz – pełnego klucza nie pokażę ponownie.</b>
            <div className="hint">Claude (claude.ai lub aplikacja): Ustawienia → Konektory → Dodaj własny konektor → wklej adres:</div>
            <pre className="snippet">{connectorUrl}</pre>
            <button className="btn small" onClick={() => copy("url", connectorUrl)}>{copied === "url" ? "Skopiowano ✓" : "Kopiuj adres konektora"}</button>
            <div className="hint" style={{ marginTop: 8 }}>Claude Code (terminal):</div>
            <pre className="snippet">{cli}</pre>
            <button className="btn small" onClick={() => copy("cli", cli)}>{copied === "cli" ? "Skopiowano ✓" : "Kopiuj polecenie"}</button>
            <p className="hint">Adres konektora zawiera klucz – traktuj go jak hasło. Nazwy menu w Claude mogą się nieco różnić.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Aktywne klucze</h3>
        {!keys.length && <p className="hint">Brak kluczy – asystent AI nie ma dostępu.</p>}
        <table className="tbl">
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td><b>{k.name}</b></td>
                <td><code>{k.hint}</code></td>
                <td className="hint">utworzony {new Date(k.created_at).toLocaleDateString("pl-PL")}</td>
                <td className="hint">{k.last_used_at ? `ostatnio użyty ${new Date(k.last_used_at).toLocaleString("pl-PL")}` : "jeszcze nieużyty"}</td>
                <td>
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      if (!confirm(`Wyłączyć klucz „${k.name}”? Asystent z tym kluczem straci dostęp od razu.`)) return;
                      await api(`/api/ai-keys?key=${k.id}`, "DELETE");
                      load();
                    }}
                  >
                    Wyłącz
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Co asystent może zrobić</h3>
        <ul className="wz-list">
          <li>zakładać klientów, projekty i lejki (także z szablonów),</li>
          <li>uzupełniać przewodnik „Zbuduj ze mną” (model, strony z adresami, źródła, płatności) i sprawdzać na żywo, co działa,</li>
          <li>budować i zmieniać mapy: węzły, adresy, dopasowania źródeł, cele, notatki, strzałki,</li>
          <li>czytać liczby z analizy i ekonomii, dodawać metryki, dane ręczne, wpisy na osi czasu, zmieniać ustawienia klienta,</li>
          <li>importować dane reklam i zamówień z plików, które mu wyślesz, i uruchamiać synchronizację Meta / WooCommerce.</li>
        </ul>
        <p className="hint">Nie może: wkleić skryptu na Twoją stronę, wygenerować tokenu Meta ani kluczy WooCommerce, usuwać klientów i projektów.</p>
      </div>
    </div>
  );
}
