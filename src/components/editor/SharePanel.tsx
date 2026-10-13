"use client";
import { useEffect, useState } from "react";
import { api } from "../forms";

export function SharePanel({ funnelId, onClose }: { funnelId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ token: string | null }>(`/api/funnels/${funnelId}/share`).then((r) => setToken(r.token)).catch(() => setToken(null));
  }, [funnelId]);
  const url = token ? `${window.location.origin}/share/${token}` : "";
  const toggle = async (enable: boolean) => {
    const r = await api<{ token: string | null }>(`/api/funnels/${funnelId}/share`, "POST", { enable });
    setToken(r.token);
    setMsg(enable ? "Link utworzony" : "Link wyłączony");
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Udostępnij">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Udostępnij lejek</h2>
          <button className="btn small" onClick={onClose}>Zamknij</button>
        </div>
        <p className="hint">
          Osoba z linkiem zobaczy mapę i liczby (tylko do odczytu) – bez logowania. Nie zobaczy innych lejków, danych osób ani ustawień.
        </p>
        {token === undefined && <p className="hint">Wczytuję…</p>}
        {token === null && <button className="btn primary" onClick={() => toggle(true)}>Utwórz link</button>}
        {token && (
          <>
            <pre className="snippet">{url}</pre>
            <div className="row">
              <button className="btn small" onClick={() => navigator.clipboard.writeText(url).then(() => setMsg("Skopiowano"))}>Kopiuj</button>
              <button className="btn small" onClick={() => toggle(true)} title="Stary link przestanie działać">Nowy link</button>
              <button className="btn small danger" onClick={() => toggle(false)}>Wyłącz udostępnianie</button>
            </div>
          </>
        )}
        {msg && <p className="hint">{msg}</p>}
      </div>
    </div>
  );
}
