"use client";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) window.location.href = "/";
    else setError((await res.json().catch(() => ({}))).error ?? "Błąd logowania");
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand">Analityka<span>.</span></div>
        <label className="field">
          Hasło
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy || !password}>Zaloguj</button>
      </form>
    </div>
  );
}
