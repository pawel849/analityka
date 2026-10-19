"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Code, Copy, Hand, KeyRound, Link2, Plug, ShieldAlert, ShoppingCart, Sparkles, Trash2, Webhook } from "lucide-react";
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

  const MANUAL: { icon: typeof Code; title: string; how: string }[] = [
    { icon: Code, title: "Wkleić skrypt śledzący na strony", how: "Kod skryptu jest w projekcie: Przewodnik konfiguracji albo Źródła danych. Wklejasz go w <head> każdej strony lejka (WordPress: wtyczka do nagłówka lub motyw)." },
    { icon: KeyRound, title: "Wygenerować token Meta", how: "Business Manager → Ustawienia firmy → Użytkownicy → Użytkownicy systemowi → przypisz konto reklamowe → „Wygeneruj token” z uprawnieniem ads_read. Wklej w Źródła danych → API." },
    { icon: ShoppingCart, title: "Utworzyć klucze WooCommerce", how: "WordPress → WooCommerce → Ustawienia → Zaawansowane → REST API → Dodaj klucz (uprawnienie: Odczyt). Wklej w Źródła danych → API." },
    { icon: Link2, title: "Ustawić parametry URL w reklamach", how: "W reklamach Meta wklej parametry UTM z modułu Testy reklam – bez nich nie połączymy reklamy z wejściem i zakupem." },
    { icon: Webhook, title: "Podpiąć webhook (zapisy, zamówienia spoza WooCommerce)", how: "Adres webhooka jest w Źródłach danych. Wklejasz go w narzędziu do maili / formularzy / płatności." },
    { icon: Sparkles, title: "Ustawić klucz Claude dla sesji analitycznej", how: "Vercel → projekt → Settings → Environment Variables → ANTHROPIC_API_KEY, potem Redeploy. Bez tego pytania i analiza Claude w sesji nie działają." },
    { icon: Trash2, title: "Usuwać klientów i projekty", how: "Tylko Ty, w aplikacji – asystent nie usuwa danych." },
  ];
  return (
    <div className="ai">
      <section className="ai-card">
        <h2><Plug size={20} /> Podłącz Claude</h2>
        <ol className="ai-steps">
          <li><span>1</span><div><b>Utwórz klucz</b>
            <form className="row" onSubmit={async (e) => { e.preventDefault(); const r = await api<{ token: string }>("/api/ai-keys", "POST", { name }); setFresh(r.token); setCopied(""); load(); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nazwa klucza" />
              <button className="btn primary"><KeyRound size={15} /> Utwórz klucz</button>
            </form>
          </div></li>
          <li><span>2</span><div><b>Skopiuj adres konektora</b>
            {fresh ? (
              <>
                <pre className="snippet">{connectorUrl}</pre>
                <button className="btn small" onClick={() => copy("url", connectorUrl)}>{copied === "url" ? <><Check size={14} /> Skopiowano</> : <><Copy size={14} /> Kopiuj adres</>}</button>
                <details><summary>Claude Code (terminal)</summary><pre className="snippet">{cli}</pre><button className="btn small" onClick={() => copy("cli", cli)}>{copied === "cli" ? "Skopiowano" : "Kopiuj polecenie"}</button></details>
                <p className="ai-warn"><ShieldAlert size={15} /> Pełnego klucza nie pokażę ponownie. Adres zawiera klucz – traktuj go jak hasło.</p>
              </>
            ) : <small>pojawi się po utworzeniu klucza</small>}
          </div></li>
          <li><span>3</span><div><b>Wklej w Claude</b><small>claude.ai lub aplikacja: Ustawienia → Konektory → Dodaj własny konektor → wklej adres.</small></div></li>
        </ol>
      </section>

      <section className="ai-card">
        <h2><KeyRound size={20} /> Aktywne klucze</h2>
        {!keys.length && <p className="ai-empty">Brak kluczy – asystent nie ma dostępu.</p>}
        <div className="ai-keys">
          {keys.map((k) => (
            <div key={k.id} className="ai-key">
              <b>{k.name}</b>
              <code>{k.hint}</code>
              <small>{k.last_used_at ? `użyty ${new Date(k.last_used_at).toLocaleString("pl-PL")}` : "jeszcze nieużyty"}</small>
              <button className="btn small danger" onClick={async () => { if (!confirm(`Wyłączyć klucz „${k.name}”? Asystent z tym kluczem straci dostęp od razu.`)) return; await api(`/api/ai-keys?key=${k.id}`, "DELETE"); load(); }}>Wyłącz</button>
            </div>
          ))}
        </div>
      </section>

      <section className="ai-card">
        <h2><Hand size={20} /> Co musisz zrobić ręcznie</h2>
        <div className="ai-manual">
          {MANUAL.map(({ icon: I, title, how }) => (
            <div key={title} className="ai-m"><span><I size={20} /></span><div><b>{title}</b><p>{how}</p></div></div>
          ))}
        </div>
      </section>
    </div>
  );
}
