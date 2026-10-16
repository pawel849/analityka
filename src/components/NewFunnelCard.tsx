"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "./forms";

/** Kafelek „Nowa mapa”: klik → nazwa → otwiera edytor (tam wybór szablonu albo pustej mapy). */
export function NewFunnelCard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const row = await api<{ id: string }>("/api/funnels", "POST", { project_id: projectId, name: name.trim() });
      router.push(`/funnels/${row.id}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button className="canvas-card canvas-new" onClick={() => setOpen(true)}>
        <Plus size={44} strokeWidth={1.6} />
        <b>Nowa mapa</b>
      </button>
    );
  return (
    <form className="canvas-card canvas-new open" onSubmit={create}>
      <b>Nazwa mapy</b>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="np. VSL – Dykcja" />
      <div className="row">
        <button type="button" className="btn" onClick={() => setOpen(false)}>Anuluj</button>
        <button className="btn primary" disabled={busy || !name.trim()}>{busy ? "Tworzę…" : "Utwórz"}</button>
      </div>
      {err && <span className="error">{err}</span>}
    </form>
  );
}
