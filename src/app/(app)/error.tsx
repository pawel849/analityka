"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page">
      <h1>Coś poszło nie tak</h1>
      <p className="sub">
        Najczęstsza przyczyna po wdrożeniu: brak połączenia z bazą danych. Otwórz{" "}
        <a href="/api/health" target="_blank" rel="noreferrer">/api/health</a> – zobaczysz, czego brakuje.
      </p>
      {error.digest && <p className="hint">Kod błędu: {error.digest}</p>}
      <button className="btn primary" onClick={reset}>Spróbuj ponownie</button>
    </main>
  );
}
