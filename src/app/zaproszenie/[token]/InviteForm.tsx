"use client";
import { useState } from "react";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    setBusy(false);
    if (res.ok) window.location.href = "/";
    else setError((await res.json().catch(() => ({}))).error ?? "Błąd");
  }
  return (
    <form className="login-form" onSubmit={submit}>
      <label className="field">
        E-mail
        <input value={email} disabled />
      </label>
      <label className="field">
        Ustaw hasło (min. 8 znaków)
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="btn primary" disabled={busy || password.length < 8}>Zapisz i wejdź</button>
    </form>
  );
}
