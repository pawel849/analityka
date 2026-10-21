"use client";

import { useEffect, useState } from "react";
import { Check, CircleCheck, Clock, Copy, Link2, Trash2, UserPlus, X } from "lucide-react";
import { api } from "../forms";

interface Member {
  id: string;
  email: string;
  active: boolean;
}

/** Osoby z dostępem do jednego klienta: dodawanie po e-mailu, link do ustawienia hasła, usuwanie. */
export function PeopleModal({ client, onClose }: { client: { id: string; name: string }; onClose: () => void }) {
  const [list, setList] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const base = `/api/clients/${client.id}/members`;
  const load = () => api<Member[]>(base).then(setList).catch((x) => setErr(x.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const showLink = (mail: string, token: string) => {
    setCopied(false);
    setLink({ email: mail, url: `${window.location.origin}/zaproszenie/${token}` });
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const r = await api<{ member: Member; invite: string | null }>(base, "POST", { email });
      if (r.invite) showLink(r.member.email, r.invite);
      else setLink(null);
      setEmail("");
      await load();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const relink = async (m: Member) => {
    const r = await api<{ invite: string }>(`${base}/${m.id}`, "POST");
    showLink(m.email, r.invite);
  };
  const remove = async (m: Member) => {
    if (!window.confirm(`Odebrać dostęp do „${client.name}” dla ${m.email}?`)) return;
    await api(`${base}/${m.id}`, "DELETE");
    if (link?.email === m.email) setLink(null);
    await load();
  };
  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url).catch(() => {});
    setCopied(true);
  };
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ppl" role="dialog" aria-modal="true" aria-label={`Dostęp – ${client.name}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="ppl-title">Dostęp: {client.name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Zamknij"><X size={18} /></button>
        </div>
        <form className="ppl-add" onSubmit={add}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail osoby" aria-label="E-mail osoby" autoFocus />
          <button className="btn primary" disabled={!email.trim()}><UserPlus size={16} /> Dodaj</button>
        </form>
        {err && <p className="error">{err}</p>}
        {link && (
          <div className="ppl-link">
            <Link2 size={18} />
            <div>
              <b>Wyślij ten link: {link.email}</b>
              <code>{link.url}</code>
              <small>ważny 7 dni · jednorazowy</small>
            </div>
            <button className="btn" onClick={copy}>{copied ? <><Check size={15} /> Skopiowano</> : <><Copy size={15} /> Kopiuj</>}</button>
          </div>
        )}
        <ul className="ppl-list">
          {list?.map((m) => (
            <li key={m.id}>
              <span className="avatar sm">{m.email[0]?.toUpperCase()}</span>
              <span className="ppl-mail">{m.email}</span>
              <span className={`ppl-st ${m.active ? "on" : ""}`}>{m.active ? <><CircleCheck size={14} /> aktywny</> : <><Clock size={14} /> czeka na hasło</>}</span>
              <button className="icon-btn" title="Nowy link do hasła" aria-label={`Nowy link dla ${m.email}`} onClick={() => relink(m)}><Link2 size={16} /></button>
              <button className="icon-btn danger" title="Odbierz dostęp" aria-label={`Odbierz dostęp ${m.email}`} onClick={() => remove(m)}><Trash2 size={16} /></button>
            </li>
          ))}
          {list && !list.length && <li className="ppl-empty">Tylko Ty</li>}
        </ul>
      </div>
    </div>
  );
}
