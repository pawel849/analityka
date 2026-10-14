import Link from "next/link";
import { requireAuth, authDisabled } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { HelpCenter } from "@/components/help/HelpCenter";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <>
      <header className="shell-header">
        <Link href="/" className="brand">Analityka<span>.</span></Link>
        <div className="spacer" />
        <Link href="/ai" className="hint">Dostęp dla AI</Link>
        <HelpCenter />
        {authDisabled() ? <span className="hint">Tryb lokalny – logowanie wyłączone</span> : <LogoutButton />}
      </header>
      {children}
    </>
  );
}
