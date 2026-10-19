"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Link2, Pencil, Trash2 } from "lucide-react";
import { api } from "../forms";

/** PDF (druk przeglądarki) i link tylko do odczytu dla klienta. */
export function ReportActions({ lid, back }: { lid: string; back: string }) {
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
      <DeleteReport lid={lid} back={back} />
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

/** Usuwanie raportu (z potwierdzeniem). */
export function DeleteReport({ lid, back, small }: { lid: string; back?: string; small?: boolean }) {
  const router = useRouter();
  const del = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Usunąć raport? Nie da się tego cofnąć. Decyzje z tej sesji zostają do sprawdzenia.")) return;
    await api(`/api/reports/${lid}`, "DELETE");
    if (back) router.push(back);
    else router.refresh();
  };
  return small
    ? <button className="icon-btn danger" onClick={del} aria-label="Usuń raport" title="Usuń raport"><Trash2 size={16} /></button>
    : <button className="btn danger" onClick={del}><Trash2 size={15} /> Usuń</button>;
}
