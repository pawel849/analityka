"use client";

import { useState } from "react";
import { Download, Link2, Check } from "lucide-react";
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
