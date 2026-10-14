"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HELP_ARTICLES, TOURS, searchHelp, type Tour } from "@/lib/help";

type Tab = "tours" | "help" | "ask";
interface Msg {
  role: "user" | "assistant";
  content: string;
  related?: { id: string; title: string }[];
  local?: boolean;
}

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* brak dostępu do pamięci przeglądarki */
    }
  },
};

/** Otwiera centrum pomocy z dowolnego miejsca aplikacji. */
export function openHelp(tab: Tab = "tours", article?: string) {
  window.dispatchEvent(new CustomEvent("anl-help", { detail: { tab, article } }));
}

export function HelpCenter() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("tours");
  const [query, setQuery] = useState("");
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [tour, setTour] = useState<{ t: Tour; i: number } | null>(null);
  const [offer, setOffer] = useState<Tour | null>(null);

  const pageTours = useMemo(() => TOURS.filter((t) => new RegExp(t.path).test(pathname)), [pathname]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ tab?: Tab; article?: string }>).detail ?? {};
      setOpen(true);
      if (d.tab) setTab(d.tab);
      if (d.article) setOpenArticle(d.article);
    };
    window.addEventListener("anl-help", onOpen);
    return () => window.removeEventListener("anl-help", onOpen);
  }, []);

  // Pierwsza wizyta na danym typie strony → propozycja samouczka.
  useEffect(() => {
    const t = pageTours[0];
    setOffer(t && !store.get(`anl_tour_${t.id}`) ? t : null);
  }, [pageTours]);

  // Kliknięcie poza dymkiem = „nie teraz” (samouczek zostaje dostępny pod „?”).
  useEffect(() => {
    if (!offer) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.(".help-offer, .help-btn")) return;
      store.set(`anl_tour_${offer.id}`, "1");
      setOffer(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [offer]);

  const startTour = (t: Tour) => {
    store.set(`anl_tour_${t.id}`, "1");
    setOffer(null);
    setOpen(false);
    setTour({ t, i: 0 });
  };

  const articles = query.trim() ? searchHelp(query, 20) : HELP_ARTICLES;

  return (
    <>
      <button className="help-btn" data-tour="help" title="Pomoc i samouczki" aria-label="Pomoc i samouczki" onClick={() => setOpen((v) => !v)}>
        ?
      </button>

      {offer && !open && !tour && (
        <div className="help-offer" role="dialog" aria-label="Propozycja samouczka">
          <b>Nie wiesz, od czego zacząć?</b>
          <p>Krótki samouczek: {offer.title.toLowerCase()} ({offer.steps.length} kroków).</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              className="btn small"
              onClick={() => {
                store.set(`anl_tour_${offer.id}`, "1");
                setOffer(null);
              }}
            >
              Nie teraz
            </button>
            <button className="btn small primary" onClick={() => startTour(offer)}>Pokaż</button>
          </div>
        </div>
      )}

      {open && (
        <aside className="help-drawer" aria-label="Centrum pomocy">
          <div className="help-head">
            <b>Pomoc</b>
            <div className="spacer" />
            <button className="btn small" onClick={() => setOpen(false)} aria-label="Zamknij pomoc">×</button>
          </div>
          <nav className="help-tabs">
            {(
              [
                ["tours", "Samouczki"],
                ["help", "Jak to działa"],
                ["ask", "Zapytaj"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
            ))}
          </nav>

          <div className="help-body">
            {tab === "tours" && (
              <div>
                <p className="hint">Samouczek podświetla elementy na ekranie i opisuje je krok po kroku.</p>
                {TOURS.map((t) => {
                  const here = pageTours.includes(t);
                  return (
                    <div key={t.id} className="help-tour">
                      <div>
                        <b>{t.title}</b>
                        <div className="hint">{here ? `${t.steps.length} kroków · dostępny na tej stronie` : t.hint ?? "Przejdź na stronę główną."}</div>
                      </div>
                      <button className="btn small primary" disabled={!here} onClick={() => startTour(t)}>Start</button>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "help" && (
              <div>
                <input className="help-search" placeholder="Szukaj, np. skrypt, koszty, brak danych…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {articles.map((a) => (
                  <details key={a.id} className="help-article" open={openArticle === a.id} onToggle={(e) => (e.currentTarget.open ? setOpenArticle(a.id) : openArticle === a.id && setOpenArticle(null))}>
                    <summary>{a.title}</summary>
                    {a.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </details>
                ))}
                {!articles.length && <p className="hint">Nic nie znaleziono. Zadaj pytanie w zakładce „Zapytaj”.</p>}
              </div>
            )}

            {tab === "ask" && (
              <AskChat
                path={pathname}
                onOpenArticle={(id) => {
                  setQuery("");
                  setOpenArticle(id);
                  setTab("help");
                }}
              />
            )}
          </div>
        </aside>
      )}

      {tour && <TourOverlay tour={tour.t} index={tour.i} onIndex={(i) => setTour((s) => (s ? { ...s, i } : s))} onClose={() => setTour(null)} />}
    </>
  );
}

function AskChat({ path, onOpenArticle }: { path: string; onOpenArticle: (id: string) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs, busy]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, messages: next.filter((m) => !m.local).map(({ role, content }) => ({ role, content })) }),
      });
      const data = (await res.json()) as { answer?: string | null; related?: { id: string; title: string }[]; ai?: boolean; error?: string };
      const related = data.related ?? searchHelp(q, 3).map((a) => ({ id: a.id, title: a.title }));
      if (data.error) setMsgs((m) => [...m, { role: "assistant", content: data.error!, related, local: true }]);
      else if (!data.ai)
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            local: true,
            related,
            content: related.length
              ? "Asystent AI nie jest włączony (brak ANTHROPIC_API_KEY na serwerze). Pasujące artykuły pomocy:"
              : "Asystent AI nie jest włączony (brak ANTHROPIC_API_KEY na serwerze), a w pomocy nie znalazłem pasującego artykułu. Spróbuj innych słów.",
          },
        ]);
      else setMsgs((m) => [...m, { role: "assistant", content: data.answer ?? "", related }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Nie udało się połączyć z serwerem.", local: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="help-chat">
      <div className="help-msgs">
        {!msgs.length && (
          <div className="hint">
            <p>Zapytaj, jak coś zrobić w aplikacji, np.:</p>
            {["Jak zainstalować skrypt na WordPressie?", "Dlaczego nie widzę liczb na mapie?", "Jak wpisać koszty reklam?"].map((s) => (
              <button key={s} className="help-suggest" onClick={() => setText(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`help-msg ${m.role}`}>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
            {m.role === "assistant" && !!m.related?.length && (
              <div className="help-related">
                {m.related.map((r) => (
                  <button key={r.id} onClick={() => onOpenArticle(r.id)}>→ {r.title}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="help-msg assistant hint">Piszę odpowiedź…</div>}
        <div ref={end} />
      </div>
      <form
        className="help-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          rows={2}
          placeholder="Twoje pytanie…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn primary" disabled={busy || !text.trim()}>Wyślij</button>
      </form>
    </div>
  );
}

function TourOverlay({ tour, index, onIndex, onClose }: { tour: Tour; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const step = tour.steps[index];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const last = index === tour.steps.length - 1;

  const measure = useCallback(() => {
    if (!step.target) return setRect(null);
    const el = document.querySelector(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect((prev) => (prev && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height ? prev : r));
  }, [step]);

  useEffect(() => {
    setMissing(false);
    setRect(null);
    if (step.click) (document.querySelector(step.click) as HTMLElement | null)?.click();
    let tries = 0;
    const find = setInterval(() => {
      const el = step.target ? document.querySelector(step.target) : null;
      if (el || !step.target || ++tries > 12) {
        clearInterval(find);
        if (el) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          measure();
        } else if (step.target) setMissing(true);
      }
    }, 120);
    const keep = setInterval(measure, 300);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(find);
      clearInterval(keep);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && !last) onIndex(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, onClose, onIndex]);

  const pad = 6;
  const W = 320;
  let pos: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - rect.bottom;
    const right = vw - rect.right;
    const clampX = (x: number) => Math.max(12, Math.min(vw - W - 12, x));
    const clampY = (y: number) => Math.max(12, Math.min(vh - 220, y));
    if (rect.height > vh * 0.55 && right > W + 24) pos = { left: rect.right + 14, top: clampY(rect.top + 20) };
    else if (rect.height > vh * 0.55 && rect.left > W + 24) pos = { left: rect.left - W - 14, top: clampY(rect.top + 20) };
    else if (below > 200) pos = { left: clampX(rect.left), top: rect.bottom + 14 };
    else pos = { left: clampX(rect.left), top: clampY(rect.top - 214) };
    if (rect.width > vw * 0.6 && rect.height > vh * 0.55) pos = { left: clampX(rect.left + rect.width / 2 - W / 2), top: clampY(rect.top + 40) };
  }

  return (
    <div className="tour-layer">
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={{ ...pos, width: W }} role="dialog" aria-label={step.title}>
        <div className="hint">{tour.title} · {index + 1}/{tour.steps.length}</div>
        <b>{step.title}</b>
        <p>{step.text}</p>
        {missing && <p className="hint">Tego elementu nie ma teraz na ekranie – przejdź dalej.</p>}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn small" onClick={onClose}>Zakończ</button>
          <div className="row">
            {index > 0 && <button className="btn small" onClick={() => onIndex(index - 1)}>Wstecz</button>}
            <button className="btn small primary" onClick={() => (last ? onClose() : onIndex(index + 1))}>{last ? "Gotowe" : "Dalej"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
