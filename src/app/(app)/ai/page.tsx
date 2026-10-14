import Link from "next/link";
import { headers } from "next/headers";
import { AiAccessPanel } from "@/components/AiAccessPanel";

export default async function AiPage() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <main className="page">
      <div className="crumbs"><Link href="/">Klienci</Link> /</div>
      <h1>Dostęp dla AI (MCP)</h1>
      <p className="sub">Podłącz Claude do aplikacji – będzie mógł uzupełniać projekty, mapy i dane na Twoją prośbę w zwykłym czacie.</p>
      <AiAccessPanel origin={origin} />
    </main>
  );
}
