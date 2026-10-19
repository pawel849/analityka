"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../forms";
import { ApiConnections } from "../ApiConnections";
import { LEGACY_TABS, projectHref } from "@/lib/nav";
import { matchesPage } from "@/lib/analysis";
import { TOTAL_LABELS } from "@/lib/analysis";
import {
  BUILDERS, BUILTIN_EXPLAINED, METRIC_PRESETS, MODELS, PURCHASE_SNIPPET, ROLES, SALES, SOURCES, STEPS,
  hostOf, pathOf, scriptTag, utmLink, type PageRole, type SetupPage, type SetupState, type SourceDef,
} from "@/lib/setup";

interface Check {
  events: number;
  lastEvent: string | null;
  paths: { path: string; url: string; n: number; last: string }[];
  hosts: { host: string; n: number }[];
  utm: { source: string; medium: string; n: number; last: string }[];
  forms: { path: string; n: number; last: string }[];
  purchases: { origin: string; n: number; last: string }[];
  orders: { source: string; n: number; last: string }[];
  ads: { source: string; n: number; last: string | null }[];
  integrations: { id: string; provider: string; name: string; status: string; last_error: string }[];
  funnels: { id: string; name: string }[];
}

const LIVE_STEPS = new Set(["skrypt", "zrodla", "konwersje", "koszty", "gotowe"]);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pl-PL") : "");
const rid = () => Math.random().toString(36).slice(2, 9);

function Copy({ text, label = "Kopiuj" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        })
      }
    >
      {ok ? "Skopiowano ✓" : label}
    </button>
  );
}

function Status({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return <div className={`wz-status ${ok === true ? "ok" : ok === false ? "wait" : "info"}`}>{ok === true ? "✓" : ok === false ? "…" : "i"} <span>{children}</span></div>;
}

export function SetupWizard({ projectId, origin, trackingKey, initial }: { projectId: string; origin: string; trackingKey: string; initial: SetupState }) {
  const router = useRouter();
  const [s, setS] = useState<SetupState>(initial);
  const [check, setCheck] = useState<Check | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const step = STEPS.some((x) => x.key === s.step) ? s.step! : "biznes";
  const idx = STEPS.findIndex((x) => x.key === step);

  const save = useCallback(
    async (patch: SetupState) => {
      setS((x) => ({ ...x, ...patch }));
      setSaving(true);
      try {
        await api(`/api/projects/${projectId}/setup`, "PUT", patch);
        setErr("");
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [projectId],
  );

  const loadCheck = useCallback(() => api<Check>(`/api/projects/${projectId}/setup/check`).then(setCheck).catch(() => {}), [projectId]);
  useEffect(() => {
    loadCheck();
    if (!LIVE_STEPS.has(step)) return;
    const t = setInterval(loadCheck, 5000);
    return () => clearInterval(t);
  }, [step, loadCheck]);

  const pages = s.pages ?? [];
  const sources = (s.sources ?? []).map((id) => SOURCES.find((x) => x.id === id)).filter((x): x is SourceDef => !!x);
  const hosts = useMemo(() => [...new Set(pages.map((p) => hostOf(p.url)).filter(Boolean))], [pages]);

  const pageSeen = (p: SetupPage) => {
    const pat = pathOf(p.url);
    if (!pat || !check) return null;
    return check.paths.find((x) => matchesPage(pat, { url: x.url, path: x.path })) ?? null;
  };
  const formSeen = (p: SetupPage) => {
    const pat = pathOf(p.url);
    if (!pat || !check) return null;
    return check.forms.find((x) => matchesPage(pat, { url: "", path: x.path })) ?? null;
  };
  const utmSeen = (src: SourceDef) => (src.utmSource ? check?.utm.find((u) => u.source === src.utmSource) ?? null : null);

  // Stan każdego kroku: true = działa, false = do dokończenia, null = nie dotyczy / opcjonalny.
  const paidSources = sources.filter((x) => x.paid);
  const linkSources = sources.filter((x) => x.utmSource);
  const hasLead = pages.some((p) => p.role === "lead" || p.role === "thankyou_lead");
  const leadsOk = pages.filter((p) => p.role === "lead").every((p) => formSeen(p)) && pages.filter((p) => p.role === "thankyou_lead").every((p) => pageSeen(p));
  const purchasesOk = (check?.purchases ?? []).some((x) => x.n > 0) || (check?.orders ?? []).some((x) => x.n > 0);
  const stepOk: Record<string, boolean | null> = {
    biznes: !!(s.model && s.builder && s.sales && s.sources?.length),
    strony: pages.length > 0 && pages.every((p) => p.url.trim()),
    skrypt: check ? pages.length > 0 && pages.every((p) => pageSeen(p)) : null,
    zrodla: check ? (linkSources.length ? linkSources.every((x) => utmSeen(x)) : null) : null,
    konwersje: check ? (!hasLead && s.sales === "none" ? null : (!hasLead || leadsOk) && (s.sales === "none" || purchasesOk)) : null,
    koszty: check ? (paidSources.length ? (check.ads ?? []).some((x) => x.n > 0) : null) : null,
    mapa: !!s.funnelId,
    metryki: null,
    gotowe: null,
  };

  // Warunki przejścia dalej (tylko tam, gdzie bez odpowiedzi nie da się zrobić kolejnych kroków).
  const blocker =
    step === "biznes"
      ? !s.model ? "Wybierz, jak wygląda Twoja sprzedaż." : !s.builder ? "Wybierz, na czym są zrobione strony." : !s.sales ? "Wybierz, gdzie klient płaci." : !s.sources?.length ? "Zaznacz co najmniej jedno źródło ruchu." : ""
      : step === "strony"
        ? !pages.length ? "Dodaj co najmniej jedną stronę." : pages.some((p) => !p.url.trim()) ? "Wpisz adres każdej strony (albo usuń zbędne)." : ""
        : "";

  const go = async (k: number) => {
    const next = STEPS[k];
    if (!next) return;
    const patch: SetupState = { step: next.key };
    // Pierwsze wejście w „Strony”: propozycja stron z wybranego modelu.
    if (next.key === "strony" && !pages.length && s.model) {
      const m = MODELS.find((x) => x.id === s.model);
      patch.pages = (m?.pages ?? []).map(([name, role, example]) => ({ id: rid(), name, role, url: "", example }));
    }
    await save(patch);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const skip = async () => {
    await save({ skipped: [...new Set([...(s.skipped ?? []), step])] });
    go(idx + 1);
  };

  return (
    <div className="wz">
      <div className="wz-head">
        <div>
          <h2 style={{ margin: 0 }}>Zbuduj ze mną</h2>
          <p className="hint" style={{ margin: "2px 0 0" }}>Krok po kroku do działającej analityki: strony, skrypt, źródła, zapisy, zakupy, koszty, mapa i metryki.</p>
        </div>
        <div className="row">
          {saving && <span className="hint">Zapisuję…</span>}
          <button
            className="btn small"
            title="Wrócisz do niego z menu po lewej: „Przewodnik konfiguracji”"
            onClick={async () => {
              await save({ hidden: true });
              router.push(`/projects/${projectId}`);
              router.refresh();
            }}
          >
            Ukryj przewodnik
          </button>
        </div>
      </div>

      <ol className="wz-steps">
        {STEPS.map((x, i) => {
          const ok = stepOk[x.key];
          const visited = i < idx || s.skipped?.includes(x.key);
          const cls = i === idx ? "" : ok === true ? "past" : visited && ok === false ? "skipped" : "";
          const title = ok === true ? "Działa" : ok === false ? "Do dokończenia" : undefined;
          return (
            <li key={x.key} className={`${i === idx ? "on" : ""} ${cls}`}>
              <button onClick={() => go(i)} title={title}>
                <span className="n">{i !== idx && ok === true ? "✓" : i !== idx && visited && ok === false ? "!" : i + 1}</span> {x.short}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="card wz-body">
        <h3 className="wz-title">
          {idx + 1}. {STEPS[idx].title}
        </h3>

        {step === "biznes" && <StepBusiness s={s} save={save} />}
        {step === "strony" && <StepPages pages={pages} hosts={hosts} onChange={(p) => save({ pages: p })} />}
        {step === "skrypt" && (
          <StepScript s={s} pages={pages} hosts={hosts} origin={origin} trackingKey={trackingKey} check={check} pageSeen={pageSeen} />
        )}
        {step === "zrodla" && <StepSources sources={sources} pages={pages} utmSeen={utmSeen} />}
        {step === "konwersje" && <StepConversions s={s} pages={pages} projectId={projectId} origin={origin} check={check} formSeen={formSeen} pageSeen={pageSeen} />}
        {step === "koszty" && <StepCosts s={s} save={save} sources={sources} projectId={projectId} check={check} />}
        {step === "mapa" && <StepMap s={s} projectId={projectId} sources={sources} onBuilt={(funnelId) => setS((x) => ({ ...x, funnelId }))} />}
        {step === "metryki" && <StepMetrics s={s} save={save} />}
        {step === "gotowe" && (
          <StepDone
            s={s}
            projectId={projectId}
            check={check}
            pages={pages}
            sources={sources}
            pageSeen={pageSeen}
            utmSeen={utmSeen}
            onFinish={async (hide) => {
              await save({ done: true, hidden: hide });
              router.push(`/projects/${projectId}${hide ? "" : "/przewodnik"}`);
              router.refresh();
            }}
          />
        )}

        {err && <p className="error">{err}</p>}
        <div className="wz-nav">
          <button className="btn" disabled={idx === 0} onClick={() => go(idx - 1)}>← Wstecz</button>
          <div className="row">
            {blocker && <span className="warn">{blocker}</span>}
            {idx < STEPS.length - 1 && step !== "biznes" && step !== "strony" && (
              <button className="btn" onClick={skip} title="Możesz wrócić do tego kroku później">Pomiń na razie</button>
            )}
            {idx < STEPS.length - 1 && (
              <button className="btn primary" disabled={!!blocker} onClick={() => go(idx + 1)}>Dalej →</button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- 1. Biznes ---------- */
function StepBusiness({ s, save }: { s: SetupState; save: (p: SetupState) => void }) {
  const toggle = (id: string) => {
    const cur = new Set(s.sources ?? []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    save({ sources: [...cur] });
  };
  return (
    <div className="wz-q">
      <p className="hint">Kilka pytań – na ich podstawie dopasuję kolejne kroki. Odpowiedzi możesz zmienić w każdej chwili.</p>
      <label className="field">
        Co sprzedajesz? (krótko, np. „kurs online z marketingu”)
        <input value={s.offer ?? ""} onChange={(e) => save({ offer: e.target.value })} />
      </label>

      <h4>Jak wygląda Twoja sprzedaż?</h4>
      <div className="wz-choices">
        {MODELS.map((m) => (
          <button key={m.id} type="button" className={`wz-choice ${s.model === m.id ? "on" : ""}`} onClick={() => save({ model: m.id })}>
            <b>{m.label}</b>
            <span>{m.description}</span>
          </button>
        ))}
      </div>

      <h4>Na czym są zrobione Twoje strony?</h4>
      <div className="wz-choices">
        {BUILDERS.map((b) => (
          <button key={b.id} type="button" className={`wz-choice ${s.builder === b.id ? "on" : ""}`} onClick={() => save({ builder: b.id })}>
            <b>{b.label}</b>
          </button>
        ))}
      </div>

      <h4>Gdzie klient płaci?</h4>
      <div className="wz-choices">
        {SALES.map((x) => (
          <button key={x.id} type="button" className={`wz-choice ${s.sales === x.id ? "on" : ""}`} onClick={() => save({ sales: x.id })}>
            <b>{x.label}</b>
          </button>
        ))}
      </div>

      <h4>Skąd przychodzą ludzie? (zaznacz wszystkie)</h4>
      <div className="wz-checks">
        <div>
          <div className="hint">Płatne reklamy</div>
          {SOURCES.filter((x) => x.paid).map((x) => (
            <label key={x.id} className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={!!s.sources?.includes(x.id)} onChange={() => toggle(x.id)} /> {x.label}
            </label>
          ))}
        </div>
        <div>
          <div className="hint">Bez reklam</div>
          {SOURCES.filter((x) => !x.paid).map((x) => (
            <label key={x.id} className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={!!s.sources?.includes(x.id)} onChange={() => toggle(x.id)} /> {x.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 2. Strony ---------- */
function StepPages({ pages, hosts, onChange }: { pages: SetupPage[]; hosts: string[]; onChange: (p: SetupPage[]) => void }) {
  const [local, setLocal] = useState(pages);
  useEffect(() => setLocal(pages), [pages]);
  const set = (i: number, patch: Partial<SetupPage>) => setLocal((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const commit = (ps = local) => onChange(ps);
  const move = (i: number, d: number) => {
    const ps = [...local];
    const [x] = ps.splice(i, 1);
    ps.splice(i + d, 0, x);
    setLocal(ps);
    commit(ps);
  };
  return (
    <div>
      <p>
        Ułóż strony w kolejności, w jakiej przechodzi przez nie klient. Wpisz <b>prawdziwe adresy</b> – najprościej skopiuj je z paska przeglądarki
        (np. <code>https://twojadomena.pl/zapis</code>). Podpowiedzi w polach to tylko przykłady.
      </p>
      <p className="hint">Rodzaj strony mówi mi, co na niej mierzyć: formularz zapisu → liczę zapisy, podziękowanie po zakupie → liczę zakupy.</p>
      {local.map((p, i) => (
        <div key={p.id} className="wz-page">
          <span className="wz-num">{i + 1}</span>
          <input value={p.name} onChange={(e) => set(i, { name: e.target.value })} onBlur={() => commit()} placeholder="Nazwa strony" aria-label="Nazwa strony" />
          <input
            value={p.url}
            onChange={(e) => set(i, { url: e.target.value })}
            onBlur={() => commit()}
            placeholder={p.example ? `adres, np. https://twojadomena.pl${p.example}` : "https://twojadomena.pl/…"}
            aria-label="Adres strony"
            className={p.url.trim() ? "" : "wz-missing"}
          />
          <select
            value={p.role}
            onChange={(e) => {
              const ps = local.map((x, k) => (k === i ? { ...x, role: e.target.value as PageRole } : x));
              setLocal(ps);
              commit(ps);
            }}
            aria-label="Rodzaj strony"
            title={ROLES.find((r) => r.value === p.role)?.help}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <div className="row" style={{ gap: 2 }}>
            <button className="btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Wyżej">↑</button>
            <button className="btn small" disabled={i === local.length - 1} onClick={() => move(i, 1)} aria-label="Niżej">↓</button>
            <button
              className="btn small danger"
              onClick={() => {
                const ps = local.filter((_, k) => k !== i);
                setLocal(ps);
                commit(ps);
              }}
              aria-label="Usuń"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button
        className="btn small"
        onClick={() => {
          const ps = [...local, { id: rid(), name: "", url: "", role: "page" as PageRole }];
          setLocal(ps);
          commit(ps);
        }}
      >
        + Dodaj stronę
      </button>
      {hosts.length > 1 && (
        <p className="hint">Strony są na {hosts.length} domenach ({hosts.join(", ")}) – skrypt w następnym kroku będzie już przygotowany tak, żeby łączyć tę samą osobę między nimi.</p>
      )}
      <details className="hint" style={{ marginTop: 10 }}>
        <summary>Co, jeśli adres strony się zmienia (np. numer zamówienia w adresie)?</summary>
        Wpisz początek adresu i zakończ gwiazdką, np. <code>https://sklep.pl/zamowienie-otrzymane/*</code> – policzę wszystkie adresy, które tak się zaczynają.
      </details>
    </div>
  );
}

/* ---------- 3. Skrypt ---------- */
function StepScript({
  s, pages, hosts, origin, trackingKey, check, pageSeen,
}: {
  s: SetupState; pages: SetupPage[]; hosts: string[]; origin: string; trackingKey: string; check: Check | null;
  pageSeen: (p: SetupPage) => Check["paths"][number] | null;
}) {
  const builder = BUILDERS.find((b) => b.id === s.builder) ?? BUILDERS[BUILDERS.length - 1];
  const tag = scriptTag(origin, trackingKey, hosts);
  const ok = pages.filter((p) => pageSeen(p)).length;
  return (
    <div>
      <p>Skrypt to krótki kod, który mierzy wejścia, źródła, kliknięcia, przewijanie, formularze i wideo. Musi być na <b>każdej stronie</b> lejka.</p>
      <div className="wz-box">
        <b>Twój skrypt</b>
        <pre className="snippet">{tag}</pre>
        <Copy text={tag} label="Kopiuj skrypt" />
      </div>
      <div className="wz-box">
        <b>Jak go wkleić – {builder.label}</b>
        <ol>
          {builder.steps.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
        {!builder.sure && <p className="hint">Nie sprawdzałem dokładnych nazw menu w tym narzędziu – jeśli nie znajdziesz pola na kod, kliknij „Mam pytanie” albo wpisz nazwę narzędzia w pomocy.</p>}
      </div>
      <div className="wz-box">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>Sprawdzenie na żywo ({ok}/{pages.length} stron)</b>
          <span className="hint">odświeża się co 5 s</span>
        </div>
        <p className="hint">Po wklejeniu skryptu otwórz każdą stronę w przeglądarce (najlepiej w oknie prywatnym). Zielony znak pojawi się w ciągu kilku sekund.</p>
        {pages.map((p) => {
          const seen = pageSeen(p);
          const full = /^https?:\/\//i.test(p.url) ? p.url.replace(/\*$/, "") : "";
          return (
            <Status key={p.id} ok={!!seen}>
              <b>{p.name}</b> <code>{p.url}</code> {seen ? `– działa, ostatnia wizyta ${when(seen.last)}` : "– czekam na pierwszą wizytę"}{" "}
              {full && !seen && (
                <a href={full} target="_blank" rel="noreferrer">otwórz stronę ↗</a>
              )}
            </Status>
          );
        })}
        {check && check.events > 0 && ok < pages.length && (
          <details className="hint" style={{ marginTop: 6 }}>
            <summary>Skrypt działa, ale nie widzę niektórych stron – adresy, które już docierają</summary>
            {check.paths.slice(0, 30).map((x) => (
              <div key={x.path}><code>{x.url}</code> ({x.n})</div>
            ))}
            <p>Jeśli Twoja strona jest na tej liście pod innym adresem – popraw adres w kroku „Strony”.</p>
          </details>
        )}
        {check && check.events === 0 && <p className="hint">Nie dotarło jeszcze żadne zdarzenie z tego projektu. Sprawdź, czy skrypt jest zapisany i strona opublikowana ponownie.</p>}
      </div>
      <details className="hint">
        <summary>Na jakiejś stronie nie da się wkleić kodu (np. kasa zewnętrznej platformy)?</summary>
        To normalne przy niektórych systemach płatności. Taka strona nie pokaże liczb ze skryptu, ale zakupy policzymy inaczej w kroku „Zapisy i zakupy” (połączenie API, webhook albo strona podziękowania). Kliknij „Pomiń na razie” albo idź dalej.
      </details>
    </div>
  );
}

/* ---------- 4. Źródła ---------- */
function StepSources({ sources, pages, utmSeen }: { sources: SourceDef[]; pages: SetupPage[]; utmSeen: (s: SourceDef) => Check["utm"][number] | null }) {
  const fullPages = pages.filter((p) => /^https?:\/\//i.test(p.url) && !p.url.includes("*"));
  const [target, setTarget] = useState(fullPages[0]?.url ?? "");
  const [campaign, setCampaign] = useState("");
  return (
    <div>
      <p>
        Żeby wiedzieć, skąd przyszła osoba, linki prowadzące do Twoich stron muszą mieć na końcu krótkie oznaczenie (tzw. parametry UTM).
        Poniżej masz gotowe linki – <b>wklejasz je zamiast zwykłych</b>.
      </p>
      <div className="wz-box">
        <div className="map-grid">
          <label className="field">
            Strona, na którą prowadzą linki
            {fullPages.length ? (
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {fullPages.map((p) => (
                  <option key={p.id} value={p.url}>{p.name} – {p.url}</option>
                ))}
              </select>
            ) : (
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://twojadomena.pl/zapis" />
            )}
          </label>
          <label className="field">
            Nazwa kampanii (opcjonalnie)
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="np. webinar-listopad" />
          </label>
        </div>
      </div>
      {sources.map((src) => {
        const seen = utmSeen(src);
        const link = target ? utmLink(target, src, campaign) : "";
        return (
          <div key={src.id} className="wz-box">
            <b>{src.label}</b>
            <p className="hint" style={{ margin: "4px 0" }}>{src.where}</p>
            {src.adParams ? (
              <>
                <div className="hint">Parametry do wklejenia w ustawieniach reklam:</div>
                <pre className="snippet">{src.adParams}</pre>
                <Copy text={src.adParams} label="Kopiuj parametry" />
                {link && <div className="hint" style={{ marginTop: 6 }}>Adres strony docelowej w reklamie zostaw zwykły: <code>{target}</code></div>}
              </>
            ) : src.utmSource ? (
              link ? (
                <>
                  <pre className="snippet">{link}</pre>
                  <Copy text={link} label="Kopiuj link" />
                </>
              ) : (
                <p className="warn">Wpisz wyżej adres strony, żeby wygenerować link.</p>
              )
            ) : null}
            {src.utmSource ? (
              <Status ok={!!seen}>{seen ? `Działa – ${seen.n} os. z tego źródła, ostatnio ${when(seen.last)}` : "Czekam na pierwsze wejście z tego linku. Test: kliknij link sam w oknie prywatnym."}</Status>
            ) : (
              <Status ok={null}>Rozpozna się samo – nic nie musisz robić.</Status>
            )}
          </div>
        );
      })}
      {!sources.length && <p className="warn">Nie zaznaczono źródeł – wróć do kroku „Biznes”.</p>}
    </div>
  );
}

/* ---------- 5. Konwersje ---------- */
function StepConversions({
  s, pages, projectId, origin, check, formSeen, pageSeen,
}: {
  s: SetupState; pages: SetupPage[]; projectId: string; origin: string; check: Check | null;
  formSeen: (p: SetupPage) => Check["forms"][number] | null;
  pageSeen: (p: SetupPage) => Check["paths"][number] | null;
}) {
  const [hook, setHook] = useState("");
  const [amount, setAmount] = useState("");
  const [product, setProduct] = useState(s.offer ?? "");
  useEffect(() => {
    api<{ secret: string }>(`/api/projects/${projectId}/webhook`).then((r) => setHook(`${origin}/api/hooks/${r.secret}`)).catch(() => {});
  }, [projectId, origin]);
  const leadPages = pages.filter((p) => p.role === "lead");
  const tyLead = pages.filter((p) => p.role === "thankyou_lead");
  const tyBuy = pages.filter((p) => p.role === "thankyou_purchase");
  const purchases = (check?.purchases ?? []).reduce((a, x) => a + x.n, 0);
  const wooOrders = check?.orders.find((o) => o.source === "woocommerce")?.n ?? 0;

  return (
    <div>
      <h4>Zapisy (leady)</h4>
      {!leadPages.length && !tyLead.length && <p className="hint">W Twoim lejku nie ma strony z formularzem – ten punkt pomijamy.</p>}
      {leadPages.map((p) => {
        const f = formSeen(p);
        return (
          <div key={p.id} className="wz-box">
            <b>{p.name}</b> <code>{p.url}</code>
            <p className="hint" style={{ margin: "4px 0" }}>Formularze skrypt łapie sam. Test: zapisz się na tej stronie swoim e-mailem.</p>
            <Status ok={!!f}>{f ? `Działa – ${f.n} zapisów, ostatni ${when(f.last)}` : "Czekam na pierwszy zapis z tej strony."}</Status>
            {!f && (
              <details className="hint">
                <summary>Zapisałem się, a dalej nic?</summary>
                Formularz osadzony z innego narzędzia (np. w ramce) bywa niewidoczny dla skryptu. Wtedy liczymy zapis po wejściu na
                stronę podziękowania – dodaj ją w kroku „Strony” jako „Podziękowanie po zapisie” i wklej tam skrypt.
              </details>
            )}
          </div>
        );
      })}
      {tyLead.map((p) => (
        <Status key={p.id} ok={!!pageSeen(p)}>
          Podziękowanie po zapisie <b>{p.name}</b>: {pageSeen(p) ? "wejścia docierają" : "czekam na pierwsze wejście"}
        </Status>
      ))}

      <h4 style={{ marginTop: 18 }}>Zakupy</h4>
      {s.sales === "none" && <p className="hint">Nie sprzedajesz online – ten punkt pomijamy. Sprzedaż offline możesz dopisywać ręcznie w węźle „Zakup” na mapie.</p>}

      {s.sales === "woocommerce" && (
        <>
          <p>Połącz sklep WooCommerce – zamówienia będą pobierane same (do Ekonomii i jako zakupy na mapie). Kliknij „+ WooCommerce”.</p>
          <ApiConnections projectId={projectId} />
          <Status ok={wooOrders > 0}>{wooOrders ? `Pobrano ${wooOrders} zamówień z WooCommerce.` : "Po zapisaniu kliknij „Synchronizuj teraz”."}</Status>
        </>
      )}

      {s.sales === "stripe" && (
        <div className="wz-box">
          <ol>
            <li>Stripe → Developers (Programiści) → Webhooks → „Add endpoint”.</li>
            <li>
              Adres: <code>{hook || "…"}</code> {hook && <Copy text={hook} />}
            </li>
            <li>Zdarzenie: <code>checkout.session.completed</code> → zapisz.</li>
          </ol>
          <Status ok={purchases > 0}>{purchases ? `Docierają zakupy (${purchases}).` : "Czekam na pierwszy zakup (możesz zrobić testowy w trybie testowym Stripe – trafi tutaj jako zakup)."}</Status>
        </div>
      )}

      {s.sales && !["none", "woocommerce", "stripe"].includes(s.sales) && (
        <>
          <p>Wybierz jeden sposób (najprostszy jest A):</p>
          <div className="wz-box">
            <b>A. Kod na stronie podziękowania po zakupie</b>
            {tyBuy.length ? (
              <p className="hint">Strona: {tyBuy.map((p) => p.name).join(", ")}. Wklej tam (oprócz skryptu) poniższy kod z ceną produktu.</p>
            ) : (
              <p className="warn">Dodaj w kroku „Strony” stronę „Podziękowanie po zakupie” – tam wkleisz ten kod.</p>
            )}
            <label className="field" style={{ maxWidth: 220 }}>
              Cena produktu (zł)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="np. 297" />
            </label>
            <label className="field" style={{ maxWidth: 420 }}>
              Nazwa produktu (żeby na mapie liczyć tylko ten produkt)
              <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="np. Dykcja dla każdego" />
            </label>
            <pre className="snippet">{PURCHASE_SNIPPET(amount || "0", product)}</pre>
            <Copy text={PURCHASE_SNIPPET(amount || "0", product)} label="Kopiuj kod" />
            <p className="hint">Kilka produktów w różnych cenach = osobna strona podziękowania dla każdego albo sposób B. Jeśli platforma nie pozwala na własny kod na stronie podziękowania – użyj B.</p>
          </div>
          <div className="wz-box">
            <b>B. Automatyzacja (Zapier / Make) → webhook</b>
            <ol>
              <li>W Zapier/Make: wyzwalacz „nowe opłacone zamówienie” w {SALES.find((x) => x.id === s.sales)?.label} (jeśli jest dostępny).</li>
              <li>Akcja: Webhook → POST na adres: <code>{hook ? `${hook}?type=purchase` : "…"}</code> {hook && <Copy text={`${hook}?type=purchase`} />}</li>
              <li>Pola: <code>email</code> (e-mail klienta) i <code>value</code> (kwota).</li>
            </ol>
          </div>
          <div className="wz-box">
            <b>C. Import CSV</b>
            <p className="hint">Eksport zamówień z platformy → <Link href={`/projects/${projectId}/dane?s=import`}>Źródła danych → Import plików</Link>. Zasila Ekonomię (LTV, CAC), ale nie mapę.</p>
          </div>
          <Status ok={purchases > 0}>{purchases ? `Docierają zakupy (${purchases}).` : "Czekam na pierwszy zakup."}</Status>
        </>
      )}
    </div>
  );
}

/* ---------- 6. Koszty ---------- */
function StepCosts({ s, save, sources, projectId, check }: { s: SetupState; save: (p: SetupState) => void; sources: SourceDef[]; projectId: string; check: Check | null }) {
  const paid = sources.filter((x) => x.paid);
  const [hint, setHint] = useState(s.campaignHint ?? "");
  const metaRows = (check?.ads ?? []).filter((a) => a.source === "meta_api" || a.source === "meta").reduce((a, x) => a + x.n, 0);
  const googleRows = check?.ads.find((a) => a.source === "google_ads")?.n ?? 0;
  if (!paid.length) return <p className="hint">Nie zaznaczono płatnych reklam – ten krok pomijamy.</p>;
  return (
    <div>
      <p>Koszty reklam są potrzebne do ROAS, kosztu zapisu (CPL) i kosztu sprzedaży (CPA).</p>
      {paid.some((x) => x.costs === "meta") && (
        <div className="wz-box">
          <b>Meta (Facebook / Instagram) – połączenie API</b>
          <p className="hint">Kliknij „+ Meta Ads”, wpisz ID konta i token (instrukcja pod „Skąd wziąć dane dostępowe?”), zapisz i kliknij „Synchronizuj teraz”.</p>
          <ApiConnections projectId={projectId} />
          <label className="field" style={{ maxWidth: 420 }}>
            Fragment nazwy kampanii tego lejka (opcjonalnie)
            <input value={hint} onChange={(e) => setHint(e.target.value)} onBlur={() => save({ campaignHint: hint })} placeholder="puste = wszystkie kampanie Meta" />
          </label>
          <p className="hint">Jeśli na koncie są też kampanie innych ofert – wpisz wspólny fragment nazwy kampanii tego lejka (np. „webinar”).</p>
          <Status ok={metaRows > 0}>{metaRows ? `Są dane z Meta (${metaRows} wierszy).` : "Brak danych z Meta."}</Status>
        </div>
      )}
      {paid.some((x) => x.costs === "google") && (
        <div className="wz-box">
          <b>Google Ads / YouTube – import CSV</b>
          <p className="hint">
            Automatycznego połączenia z Google Ads jeszcze nie ma. W Google Ads pobierz raport kampanii z kolumnami: dzień, kampania, koszt, wyświetlenia,
            kliknięcia → <Link href={`/projects/${projectId}/dane?s=import`}>Źródła danych → Import plików</Link> → „Google Ads (raport)”. Powtarzaj np. raz w tygodniu.
          </p>
          <Status ok={googleRows > 0}>{googleRows ? `Są dane z Google Ads (${googleRows} wierszy).` : "Brak danych z Google Ads."}</Status>
        </div>
      )}
      {paid.filter((x) => x.costs === "csv").map((x) => (
        <div key={x.id} className="wz-box">
          <b>{x.label}</b>
          <p className="hint">
            Brak połączenia API. Dwie opcje: eksport CSV → <Link href={`/projects/${projectId}/dane?s=import`}>Źródła danych → Import plików</Link> → „Inna platforma reklamowa”
            albo wpisanie kwoty ręcznie w węźle źródła na mapie (tryb Analiza → kliknij węzeł → „Dane ręczne”).
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------- 7. Mapa ---------- */
function StepMap({ s, projectId, sources, onBuilt }: { s: SetupState; projectId: string; sources: SourceDef[]; onBuilt: (id: string) => void }) {
  const [name, setName] = useState(s.offer ? `Lejek – ${s.offer}` : "Mój lejek");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const build = async () => {
    if (s.funnelId && !confirm("Przebudować mapę? Zmiany ręczne na mapie tego lejka zostaną zastąpione.")) return;
    setBusy(true);
    try {
      const r = await api<{ funnelId: string; nodes: number }>(`/api/projects/${projectId}/setup/funnel`, "POST", { name });
      onBuilt(r.funnelId);
      setMsg(`Gotowe – mapa ma ${r.nodes} elementów.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p>Zbuduję mapę lejka z Twoich odpowiedzi – wszystko będzie już podpięte: źródła (po linkach z poprzedniego kroku), strony (po adresach), zapisy i zakupy.</p>
      <div className="wz-box">
        <div className="hint">Na mapie znajdzie się:</div>
        <div className="wz-flow">
          <div>{sources.map((x) => <span key={x.id} className="tag tag-interp">{x.label.replace(/ \(.*\)$/, "")}</span>)}</div>
          <span>→</span>
          <div>
            {(s.pages ?? []).map((p, i) => (
              <span key={p.id} className="tag tag-data">{i + 1}. {p.name}{p.role === "lead" ? " + zapis" : p.role === "thankyou_purchase" ? " + zakup" : ""}</span>
            ))}
          </div>
        </div>
      </div>
      {!s.funnelId && (
        <label className="field" style={{ maxWidth: 360 }}>
          Nazwa lejka
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={busy} onClick={build}>{busy ? "Buduję…" : s.funnelId ? "Przebuduj mapę" : "Zbuduj mapę"}</button>
        {s.funnelId && <Link className="btn" href={`/funnels/${s.funnelId}`}>Otwórz mapę ↗</Link>}
      </div>
      {msg && <p className="hint">{msg}</p>}
      {s.funnelId && <p className="hint">Na mapie przełącz w prawym górnym rogu na <b>Analiza</b> – zobaczysz liczby. Mapę możesz dowolnie zmieniać (przeciągaj, dodawaj elementy).</p>}
    </div>
  );
}

/* ---------- 8. Metryki ---------- */
function StepMetrics({ s, save }: { s: SetupState; save: (p: SetupState) => void }) {
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [own, setOwn] = useState({ name: "", formula: "", format: "number" });
  const [msg, setMsg] = useState("");
  const added = new Set(s.metrics ?? []);
  const add = async (items: { id: string; name: string; formula: string; format: string }[]) => {
    if (!s.funnelId) return setMsg("Najpierw zbuduj mapę (poprzedni krok).");
    try {
      for (const m of items) await api(`/api/funnels/${s.funnelId}/metrics`, "POST", { name: m.name, formula: m.formula, format: m.format });
      save({ metrics: [...added, ...items.map((m) => m.id)] });
      setPick(new Set());
      setMsg(`Dodano: ${items.map((m) => m.name).join(", ")}.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div>
      <h4>Te metryki masz od razu (pod mapą, w trybie Analiza):</h4>
      <ul className="wz-list">
        {BUILTIN_EXPLAINED.map(([n, d]) => (
          <li key={n}><b>{n}</b> – {d}</li>
        ))}
      </ul>
      <h4>Chcesz dodać któreś z tych?</h4>
      {METRIC_PRESETS.map((m) => (
        <label key={m.id} className="row" style={{ gap: 6, opacity: added.has(m.id) ? 0.6 : 1 }}>
          <input
            type="checkbox"
            disabled={added.has(m.id)}
            checked={added.has(m.id) || pick.has(m.id)}
            onChange={() => setPick((p) => {
              const n = new Set(p);
              if (n.has(m.id)) n.delete(m.id);
              else n.add(m.id);
              return n;
            })}
          />
          <b>{m.name}</b> <span className="hint">– {m.help}{added.has(m.id) ? " (dodana)" : ""}</span>
        </label>
      ))}
      <button className="btn small primary" style={{ marginTop: 6 }} disabled={!pick.size} onClick={() => add(METRIC_PRESETS.filter((m) => pick.has(m.id)))}>
        Dodaj zaznaczone
      </button>
      <details style={{ marginTop: 12 }}>
        <summary>Własna metryka (wzór)</summary>
        <div className="map-grid" style={{ marginTop: 6 }}>
          <label className="field">Nazwa<input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} placeholder="np. Marża" /></label>
          <label className="field">Wzór<input value={own.formula} onChange={(e) => setOwn({ ...own, formula: e.target.value })} placeholder="np. revenue * 0.6 - spend" /></label>
          <label className="field">
            Format
            <select value={own.format} onChange={(e) => setOwn({ ...own, format: e.target.value })}>
              <option value="number">liczba</option>
              <option value="money">kwota</option>
              <option value="percent">procent</option>
              <option value="ratio">krotność (×)</option>
            </select>
          </label>
        </div>
        <p className="hint">Dostępne wartości: {Object.entries(TOTAL_LABELS).map(([k, v]) => `${k} (${v.label})`).join(", ")}.</p>
        <button className="btn small" disabled={!own.name.trim() || !own.formula.trim()} onClick={() => add([{ id: `own_${rid()}`, ...own }])}>Dodaj</button>
      </details>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}

/* ---------- 9. Gotowe ---------- */
function StepDone({
  s, projectId, check, pages, sources, pageSeen, utmSeen, onFinish,
}: {
  s: SetupState; projectId: string; check: Check | null; pages: SetupPage[]; sources: SourceDef[];
  pageSeen: (p: SetupPage) => unknown; utmSeen: (s: SourceDef) => unknown; onFinish: (hide: boolean) => void;
}) {
  const pagesOk = pages.filter((p) => pageSeen(p)).length;
  const linkSources = sources.filter((x) => x.utmSource);
  const linksOk = linkSources.filter((x) => utmSeen(x)).length;
  const leadsOk = (check?.forms ?? []).length > 0;
  const purchasesOk = (check?.purchases ?? []).some((x) => x.n > 0) || (check?.orders ?? []).some((x) => x.n > 0);
  const paid = sources.some((x) => x.paid);
  const costsOk = (check?.ads ?? []).some((x) => x.n > 0);
  const hasLead = pages.some((p) => p.role === "lead" || p.role === "thankyou_lead");
  const rows: [string, boolean | null, string][] = [
    ["Skrypt na stronach", pages.length ? pagesOk === pages.length : null, `${pagesOk}/${pages.length} stron`],
    ["Linki z oznaczeniem źródła", linkSources.length ? linksOk === linkSources.length : null, linkSources.length ? `${linksOk}/${linkSources.length} źródeł` : "nie dotyczy"],
    ["Zapisy", hasLead ? leadsOk : null, hasLead ? (leadsOk ? "docierają" : "brak") : "nie dotyczy"],
    ["Zakupy", s.sales === "none" ? null : purchasesOk, s.sales === "none" ? "nie dotyczy" : purchasesOk ? "docierają" : "brak"],
    ["Koszty reklam", paid ? costsOk : null, paid ? (costsOk ? "są" : "brak") : "nie dotyczy"],
    ["Mapa lejka", !!s.funnelId, s.funnelId ? "zbudowana" : "brak"],
    ["Własne metryki", s.metrics?.length ? true : null, s.metrics?.length ? `${s.metrics.length}` : "tylko wbudowane"],
  ];
  const tab = (t: string) => projectHref(projectId, LEGACY_TABS[t] ?? "pulpit") + (t === "integracje" ? "?s=webhook" : t === "dane" ? "?s=import" : "");
  const next: [string, string, string | (() => void), boolean?][] = [
    ["Zobacz liczby na mapie", "Mapa → przełącznik Analiza, wybierz zakres dat.", s.funnelId ? `/funnels/${s.funnelId}` : tab("lejki")],
    ["Ustawienia klienta", "Waluta, VAT, produkt główny, kategorie produktów i kampanii.", tab("ustawienia")],
    ["Ekonomia: CAC i LTV", "Ile kosztuje klient i ile zostawia pieniędzy w czasie.", tab("ekonomia")],
    ["Oś czasu zmian", "Zapisuj zmiany cen, kampanii i stron – zobaczysz ich wpływ.", tab("os")],
    ["Import historii", "Starsze zamówienia i reklamy z plików CSV.", tab("dane")],
    ["Udostępnij klientowi", "Link tylko do odczytu – na mapie menu ⋯ → Udostępnij link.", s.funnelId ? `/funnels/${s.funnelId}` : tab("lejki")],
    ["Cele i ich wartość", "Oznacz ważne kroki jako cele (kliknij węzeł → Śledzenie → Cel).", s.funnelId ? `/funnels/${s.funnelId}` : tab("lejki")],
    ["Prognozy i checklisty", "Zaplanuj liczby i zadania na węzłach (kliknij węzeł → Plan).", s.funnelId ? `/funnels/${s.funnelId}` : tab("lejki")],
    ["Porównanie okresów", "Analiza → „Porównaj z poprzednim okresem”.", s.funnelId ? `/funnels/${s.funnelId}` : tab("lejki")],
    ["Kolejny lejek", "Inna oferta tego klienta – dodaj w Mapach lejków.", tab("lejki")],
    ["Zapisy z newslettera", "MailerLite / GetResponse → webhook (Źródła danych → Webhook).", tab("integracje")],
    ["Dane testowe do nauki", "Symulowany ruch po mapie, żeby poćwiczyć analizę.", tab("integracje")],
    ["Google Ads przez API", "Planowane – na razie import CSV.", "", true],
    ["Google Analytics 4 / PostHog", "Planowane.", "", true],
    ["Statystyki e-maili (otwarcia, kliknięcia)", "Planowane.", "", true],
  ];
  return (
    <div>
      <h4>Stan analityki</h4>
      {rows.map(([label, ok, info]) => (
        <Status key={label} ok={ok}>
          <b>{label}</b> – {info}
        </Status>
      ))}
      {rows.some(([, ok]) => ok === false) && (
        <p className="hint">Czerwone/szare punkty możesz dokończyć później – kliknij numer kroku u góry. Stan odświeża się sam.</p>
      )}
      <h4 style={{ marginTop: 18 }}>Co dalej? (wybierz, co chcesz rozwijać)</h4>
      <div className="wz-next">
        {next.map(([title, desc, target, planned]) =>
          planned ? (
            <div key={title} className="wz-next-item planned">
              <b>{title}</b>
              <span>{desc}</span>
            </div>
          ) : typeof target === "function" ? (
            <button key={title} type="button" className="wz-next-item" onClick={target}>
              <b>{title}</b>
              <span>{desc}</span>
            </button>
          ) : (
            <Link key={title} href={target} className="wz-next-item">
              <b>{title}</b>
              <span>{desc}</span>
            </Link>
          ),
        )}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => onFinish(true)}>Zakończ i ukryj przewodnik</button>
        <button className="btn" onClick={() => onFinish(false)}>Zakończ, ale zostaw przewodnik otwarty</button>
      </div>
    </div>
  );
}

/* ---------- Wybór na starcie ---------- */
export function SetupChoice({ projectId, compact }: { projectId: string; compact?: boolean }) {
  const router = useRouter();
  const pick = async (mode: "guided" | "self") => {
    await api(`/api/projects/${projectId}/setup`, "PUT", mode === "guided" ? { mode, hidden: false, step: "biznes" } : { mode });
    router.push(`/projects/${projectId}${mode === "guided" ? "/przewodnik" : ""}`);
    router.refresh();
  };
  return (
    <div className={`wz-choice-start ${compact ? "compact" : ""}`}>
      <button type="button" className="wz-start-card primary" onClick={() => pick("guided")}>
        <b>Zbuduj ze mną</b>
        <span>Przeprowadzę Cię krok po kroku: strony, skrypt, linki z reklam, zapisy, zakupy, koszty, mapa i metryki – aż wszystko będzie działać. Polecane, jeśli nie jesteś osobą techniczną.</span>
      </button>
      <button type="button" className="wz-start-card" onClick={() => pick("self")}>
        <b>Sam zbuduję</b>
        <span>Pusta przestrzeń – sam układasz mapy i podłączasz dane. Przewodnik możesz włączyć później.</span>
      </button>
    </div>
  );
}

export function ReopenSetup({ projectId }: { projectId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        await api(`/api/projects/${projectId}/setup`, "PUT", { mode: "guided", hidden: false });
        router.push(`/projects/${projectId}/przewodnik`);
        router.refresh();
      }}
    >
      Otwórz przewodnik „Zbuduj ze mną”
    </button>
  );
}
