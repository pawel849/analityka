import Link from "next/link";
import { requireAuth, authDisabled } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <>
      <header className="shell-header">
        <Link href="/" className="brand">Analityka<span>.</span></Link>
        <div className="spacer" />
        {user.admin ? <Link href="/ai" className="hint">Dostęp dla AI</Link> : <span className="hint">{user.email}</span>}
        {authDisabled() ? <span className="hint">Tryb lokalny – logowanie wyłączone</span> : <LogoutButton />}
      </header>
      {children}
    </>
  );
}
