"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "./forms";

/** Ikona kosza z potwierdzeniem – szybkie usuwanie bez wchodzenia w szczegóły. */
export function DeleteIcon({ url, confirmText, label, className = "" }: { url: string; confirmText: string; label: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`icon-btn danger ${className}`}
      title={label}
      aria-label={label}
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        try {
          await api(url, "DELETE");
          router.refresh();
        } catch (x) {
          window.alert(x instanceof Error ? x.message : String(x));
          setBusy(false);
        }
      }}
    >
      <Trash2 size={16} />
    </button>
  );
}
