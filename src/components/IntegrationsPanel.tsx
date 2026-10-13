"use client";
import { useEffect, useState } from "react";
import { api } from "./forms";

type Status = "ready" | "manual" | "planned";

interface Integration {
  name: string;
  group: string;
  status: Status;
  how: string;
}

// Stan na dziś: „gotowe” = działa przez webhook lub skrypt; „ręcznie” = dane wpisujesz w węźle; „planowane” = etap 3.
const INTEGRATIONS: Integration[] = [
  { name: "Webhook (dowolne narzędzie)", group: "Automatyzacje", status: "ready", how: "Wyślij POST na adres webhooka z polami email, value (opcjonalnie) i typem w adresie (?type=lead lub ?type=purchase)." },
  { name: "Zapier", group: "Automatyzacje", status: "ready", how: "Akcja „Webhooks by Zapier → POST” na adres webhooka. Pola: email, value." },
  { name: "Make / Pabbly Connect", group: "Automatyzacje", status: "ready", how: "Moduł HTTP / Webhook → POST na adres webhooka (JSON z polem email i value)." },
  { name: "Stripe", group: "Płatności", status: "ready", how: "Stripe → Developers → Webhooks → dodaj adres webhooka i zdarzenie checkout.session.completed. Kwota i e-mail odczytają się same." },
  { name: "Fakturownia", group: "Płatności", status: "planned", how: "Etap 3 (API). Do tego czasu: przychód wpisany ręcznie w węźle zakupu lub webhook z Zapiera." },
  { name: "MailerLite", group: "E-mail", status: "ready", how: "MailerLite → Integracje → Webhooks → zdarzenie „subscriber created”, adres webhooka z ?type=lead. Statystyki kampanii – etap 3." },
  { name: "GetResponse", group: "E-mail", status: "ready", how: "Przez Zapier/Make (lub webhook GetResponse, jeśli Twój plan go ma – nie sprawdzałem) na adres z ?type=lead. Statystyki kampanii – etap 3." },
  { name: "Kajabi", group: "E-mail / kursy", status: "ready", how: "Przez Zapier (lub Make) na adres z ?type=purchase albo ?type=lead. Natywnych webhooków Kajabi nie sprawdzałem." },
  { name: "WordPress", group: "Strony", status: "ready", how: "Wklej skrypt śledzący w nagłówku (np. wtyczka WPCode → Header)." },
  { name: "Własny kod / Webflow", group: "Strony", status: "ready", how: "Wklej skrypt śledzący przed </head>." },
  { name: "Wideo HTML5 / Vidalytics", group: "Wideo", status: "ready", how: "Odtworzenia wideo HTML5 śledzone automatycznie. Odtwarzacze w ramkach (YouTube, Vimeo, Vidalytics) – zdarzenie ręczne anl(\"event\", \"wideo\")." },
  { name: "Calendly / kalendarze", group: "Kalendarze", status: "ready", how: "Webhook z Calendly (w płatnych planach) lub Zapier na adres z ?type=booking." },
  { name: "Meta Ads", group: "Reklamy", status: "manual", how: "Wydatki, wyświetlenia, kliknięcia, odtworzenia 3 s wpisujesz w węźle źródła. Automatycznie – etap 3 (wymaga dostępu do Marketing API)." },
  { name: "Google Ads", group: "Reklamy", status: "manual", how: "Jak wyżej – dane ręczne w węźle. Automatycznie – etap 3 (wymaga developer tokena Google Ads)." },
  { name: "Google Analytics 4", group: "Analityka", status: "planned", how: "Etap 3 (Data API)." },
  { name: "PostHog", group: "Analityka", status: "planned", how: "Etap 3. Heatmapy pozostają w PostHog." },
];

const STATUS_LABEL: Record<Status, string> = { ready: "Gotowe", manual: "Dane ręczne", planned: "Planowane (etap 3)" };

export function IntegrationsPanel({ projectId, origin }: { projectId: string; origin: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ secret: string }>(`/api/projects/${projectId}/webhook`).then((r) => setSecret(r.secret)).catch(() => {});
  }, [projectId]);
  const url = secret ? `${origin}/api/hooks/${secret}` : "…";

  return (
    <div>
      <h2>Integracje</h2>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Adres webhooka tego projektu</h3>
        <p className="hint">Tajny – nie wklejaj go na stronę. Przyjmuje leady, zakupy i rezerwacje z innych narzędzi.</p>
        <pre className="snippet">{url}</pre>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => navigator.clipboard.writeText(url).then(() => setMsg("Skopiowano"))}>Kopiuj</button>
          <button
            className="btn small danger"
            onClick={async () => {
              if (!confirm("Wygenerować nowy adres? Stary przestanie działać we wszystkich podpiętych narzędziach.")) return;
              const r = await api<{ secret: string }>(`/api/projects/${projectId}/webhook`, "POST");
              setSecret(r.secret);
              setMsg("Nowy adres wygenerowany");
            }}
          >
            Wygeneruj nowy
          </button>
          {msg && <span className="hint">{msg}</span>}
        </div>
        <details style={{ marginTop: 10 }}>
          <summary><b>Jak to działa</b></summary>
          <ul>
            <li><code>{url}?type=lead</code> – zapis, <code>?type=purchase&amp;value=297</code> – zakup (kwotę można też podać w treści jako value/amount/total).</li>
            <li>Osoba jest rozpoznawana po e-mailu: na stronie wywołaj <code>anl(&quot;identify&quot;, email)</code> albo dodaj do skryptu <code>data-identify=&quot;forms&quot;</code> – wtedy e-mail z formularza zapisze się automatycznie.</li>
            <li>Gdy e-maila nie ma w bazie, zdarzenie i tak się zapisze (bez źródła ruchu).</li>
            <li>Stripe: rozpoznawane są zdarzenia checkout.session.completed, payment_intent.succeeded, charge.succeeded i invoice.paid. Podpis Stripe nie jest weryfikowany – zabezpieczeniem jest tajny adres.</li>
          </ul>
        </details>
      </div>
      <div className="grid">
        {INTEGRATIONS.map((i) => (
          <div key={i.name} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{i.name}</b>
              <span className={`badge status-${i.status}`}>{STATUS_LABEL[i.status]}</span>
            </div>
            <div className="meta">{i.group}</div>
            <p className="hint" style={{ marginBottom: 0 }}>{i.how}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
