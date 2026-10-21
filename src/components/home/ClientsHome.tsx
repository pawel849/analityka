"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Compass, Hammer, Pencil, Plus, Trash2, Users, Workflow, X } from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { PeopleModal } from "./People";
import { GREEN } from "@/lib/palette";

export interface HomeClient {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
}

const AVATAR = [GREEN[700], GREEN[900], GREEN[600], GREEN[800], GREEN[500]];
const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const colorOf = (id: string) => AVATAR[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];


/** Kreator nowego lejka (projektu): nazwa → adres strony → sposób budowy. */
function NewFunnelWizard({ client, onClose }: { client: HomeClient; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const create = async (mode: "guided" | "self") => {
    setBusy(true);
    setErr("");
    try {
      const p = await api<{ id: string }>("/api/projects", "POST", { client_id: client.id, name: name.trim(), domain: domain.trim() });
      await api(`/api/projects/${p.id}/setup`, "PUT", mode === "guided" ? { mode, hidden: false, step: "biznes" } : { mode });
      router.push(mode === "guided" ? `/projects/${p.id}/przewodnik` : `/projects/${p.id}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  };
  const steps = ["Nazwa", "Strona", "Jak budujemy"];
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wiz" role="dialog" aria-modal="true" aria-label="Nowy lejek">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="wiz-client"><span className="avatar sm" style={{ background: colorOf(client.id) }}>{initials(client.name)}</span>{client.name}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Zamknij"><X size={18} /></button>
        </div>
        <ol className="wiz-steps">
          {steps.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""}><span>{i + 1}</span>{s}</li>
          ))}
        </ol>
        {step === 0 && (
          <form className="wiz-body" onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep(1); }}>
            <label className="wiz-q">Jak nazwiesz ten lejek? <Tip text="Nazwa, po której go rozpoznasz, np. „VSL Dykcja” albo „Webinar maj”. Każdy lejek ma własny skrypt śledzący i własne dane." /></label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="np. VSL Dykcja" />
            <div className="wiz-nav"><span /><button className="btn primary" disabled={!name.trim()}>Dalej <ArrowRight size={16} /></button></div>
          </form>
        )}
        {step === 1 && (
          <form className="wiz-body" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
            <label className="wiz-q">Na jakiej stronie działa? <Tip text="Domena, na której są strony lejka (np. iaro.edu.pl). Służy do podpowiedzi przy konfiguracji – możesz pominąć." /></label>
            <input autoFocus value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="np. iaro.edu.pl" />
            <div className="wiz-nav">
              <button type="button" className="btn" onClick={() => setStep(0)}><ArrowLeft size={16} /> Wstecz</button>
              <button className="btn primary">{domain.trim() ? "Dalej" : "Pomiń"} <ArrowRight size={16} /></button>
            </div>
          </form>
        )}
        {step === 2 && (
          <div className="wiz-body">
            <label className="wiz-q">Jak chcesz go zbudować?</label>
            <div className="wiz-choice">
              <button className="wiz-opt primary" disabled={busy} onClick={() => create("guided")}>
                <Compass size={26} />
                <b>Krok po kroku ze mną</b>
                <span className="badge">polecane</span>
              </button>
              <button className="wiz-opt" disabled={busy} onClick={() => create("self")}>
                <Hammer size={26} />
                <b>Sam zbuduję</b>
              </button>
            </div>
            {err && <p className="error">{err}</p>}
            <div className="wiz-nav">
              <button type="button" className="btn" onClick={() => setStep(1)} disabled={busy}><ArrowLeft size={16} /> Wstecz</button>
              <span>{busy ? "Tworzę…" : ""}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddClient({ highlight, onCreated }: { highlight: boolean; onCreated: (c: HomeClient) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const c = await api<{ id: string; name: string }>("/api/clients", "POST", { name: name.trim() });
      setName("");
      setOpen(false);
      onCreated({ id: c.id, name: c.name, projects: [] });
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button className={`client-card client-add ${highlight ? "pulse" : ""}`} onClick={() => setOpen(true)} data-tour="create-client">
        <Plus size={40} strokeWidth={1.6} />
        <b>Dodaj klienta</b>
      </button>
    );
  return (
    <form className="client-card client-add open" onSubmit={submit} data-tour="create-client">
      <b>Nazwa klienta</b>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="np. IARO" />
      <div className="row">
        <button type="button" className="btn" onClick={() => setOpen(false)}>Anuluj</button>
        <button className="btn primary" disabled={busy || !name.trim()}>{busy ? "Dodaję…" : "Dodaj"}</button>
      </div>
      {err && <span className="error">{err}</span>}
    </form>
  );
}

export function ClientsHome({ clients, admin }: { clients: HomeClient[]; admin: boolean }) {
  const router = useRouter();
  const [wizard, setWizard] = useState<HomeClient | null>(null);
  const [people, setPeople] = useState<HomeClient | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async (url: string, text: string) => {
    if (!window.confirm(text)) return;
    setBusy(true);
    try {
      await api(url, "DELETE");
      router.refresh();
    } catch (x) {
      window.alert(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  const rename = async (url: string, current: string) => {
    const name = window.prompt("Nowa nazwa", current)?.trim();
    if (!name || name === current) return;
    setBusy(true);
    try {
      await api(url, "PATCH", { name });
      router.refresh();
    } catch (x) {
      window.alert(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="home-head">
        <h1>Klienci</h1>
        <Tip text="Klient to firma, dla której mierzysz wyniki. Każdy klient ma swoje lejki (np. VSL, webinar), a każdy lejek – własny skrypt śledzący i dane. Kliknij lejek, żeby otworzyć pulpit i narzędzia." />
      </div>
      <div className="client-grid" data-tour="client-list">
        {clients.map((c) => (
          <div key={c.id} className="client-card">
            <div className="cc-head">
              <span className="avatar" style={{ background: colorOf(c.id) }}>{initials(c.name)}</span>
              <b className="cc-name">{c.name}</b>
              <button className="icon-btn" disabled={busy} title="Zmień nazwę" aria-label={`Zmień nazwę ${c.name}`} onClick={() => rename(`/api/clients/${c.id}`, c.name)}>
                <Pencil size={15} />
              </button>
              {admin && (
                <button className="icon-btn ppl-btn" title="Dostęp dla osób" aria-label={`Dostęp do ${c.name}`} onClick={() => setPeople(c)}>
                  <Users size={16} />
                </button>
              )}
              {admin && (
                <button
                  className="icon-btn danger"
                  disabled={busy}
                  title="Usuń klienta"
                  aria-label={`Usuń klienta ${c.name}`}
                  onClick={() => remove(`/api/clients/${c.id}`, `Usunąć klienta „${c.name}” razem z ${c.projects.length} lejkami i wszystkimi danymi? Nie da się tego cofnąć.`)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="cc-projects">
              {c.projects.map((p) => (
                <div key={p.id} className="cc-proj">
                  <Link href={`/projects/${p.id}`}>
                    <Workflow size={16} />
                    <span>{p.name}</span>
                    <ArrowRight size={15} className="cc-go" />
                  </Link>
                  <button className="icon-btn" disabled={busy} title="Zmień nazwę" aria-label={`Zmień nazwę ${p.name}`} onClick={() => rename(`/api/projects/${p.id}`, p.name)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-btn danger"
                    disabled={busy}
                    title="Usuń lejek"
                    aria-label={`Usuń lejek ${p.name}`}
                    onClick={() => remove(`/api/projects/${p.id}`, `Usunąć lejek „${p.name}” razem z mapami, testami i zebranymi danymi? Nie da się tego cofnąć.`)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button className={`btn primary cc-add ${c.projects.length ? "" : "pulse"}`} onClick={() => setWizard(c)}>
              <Plus size={16} /> Dodaj nowy lejek
            </button>
          </div>
        ))}
        {admin && <AddClient highlight={!clients.length} onCreated={(c) => { router.refresh(); setWizard(c); }} />}
      </div>
      {wizard && <NewFunnelWizard client={wizard} onClose={() => setWizard(null)} />}
      {people && <PeopleModal client={people} onClose={() => setPeople(null)} />}
    </>
  );
}
