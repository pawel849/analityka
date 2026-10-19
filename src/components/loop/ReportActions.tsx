"use client";

import { useState } from "react";
import { Check, Download, Link2, Pencil } from "lucide-react";
import { api } from "../forms";

/** PDF (druk przeglądarki) i link tylko do odczytu dla klienta. */
export function ReportActions({ lid }: { lid: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const { token } = await api<{ token: string }>(`/api/reports/${lid}/share`, "POST");
    await navigator.clipboard.writeText(`${location.origin}/raport/${token}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="row">
      <button className="btn" onClick={() => window.print()}><Download size={15} /> Pobierz PDF</button>
      <button className="btn primary" onClick={share}>{copied ? <><Check size={15} /> Link skopiowany</> : <><Link2 size={15} /> Link dla klienta</>}</button>
    </div>
  );
}

/** Tytuł raportu z edycją (ołówek). */
export function ReportTitle({ lid, initial }: { lid: string; initial: string }) {
  const [t, setT] = useState(initial);
  const [edit, setEdit] = useState(false);
  const save = async () => {
    await api(`/api/reports/${lid}`, "PATCH", { title: t });
    setEdit(false);
  };
  if (!edit)
    return (
      <h1 className="rp-title">{t} <button className="icon-btn no-print" onClick={() => setEdit(true)} aria-label="Zmień tytuł" title="Zmień tytuł"><Pencil size={16} /></button></h1>
    );
  return (
    <div className="rp-title-edit">
      <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} autoFocus aria-label="Tytuł raportu" />
      <button className="btn primary" onClick={save} disabled={!t.trim()}><Check size={15} /> Zapisz</button>
    </div>
  );
}
