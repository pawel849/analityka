import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Bot } from "lucide-react";
import { AiAccessPanel } from "@/components/AiAccessPanel";

export default async function AiPage() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <main className="page">
      <header className="tool-head">
        <div className="tool-title">
          <Link href="/" className="back-btn" aria-label="Wróć do klientów"><ArrowLeft size={20} /></Link>
          <span className="tool-title-ic"><Bot size={20} /></span>
          <h1>Dostęp dla AI</h1>
        </div>
      </header>
      <AiAccessPanel origin={origin} />
    </main>
  );
}
