"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export async function api<T = unknown>(url: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Błąd ${res.status}`);
  return json as T;
}

interface Field {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

/** Prosty formularz „dodaj” – wysyła POST i odświeża stronę (lub przechodzi pod adres z odpowiedzi). */
export function CreateForm({
  url,
  fields,
  extra,
  submitLabel,
  goTo,
}: {
  url: string;
  fields: Field[];
  extra?: Record<string, string>;
  submitLabel: string;
  goTo?: string; // np. "/funnels/" – dołączy id z odpowiedzi
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = await api<{ id: string }>(url, "POST", { ...extra, ...values });
      setValues({});
      if (goTo) router.push(goTo + row.id);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="row">
      {fields.map((f) => (
        <input
          key={f.name}
          placeholder={f.placeholder ?? f.label}
          aria-label={f.label}
          required={f.required}
          value={values[f.name] ?? ""}
          onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
        />
      ))}
      <button className="btn primary" disabled={busy}>{submitLabel}</button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

export function DeleteButton({ url, confirmText, goTo }: { url: string; confirmText: string; goTo?: string }) {
  const router = useRouter();
  return (
    <button
      className="btn small danger"
      onClick={async () => {
        if (!confirm(confirmText)) return;
        try {
          await api(url, "DELETE");
          if (goTo) router.push(goTo);
          else router.refresh();
        } catch (e) {
          alert(e instanceof Error ? e.message : String(e));
        }
      }}
    >
      Usuń
    </button>
  );
}
