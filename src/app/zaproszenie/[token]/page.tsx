import { inviteUser } from "@/lib/access";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

/** Publiczna strona z linku zaproszenia: osoba ustawia hasło. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await inviteUser(token);
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="brand">Analityka<span>.</span></div>
        {u ? <InviteForm token={token} email={u.email} /> : <div className="error">Link wygasł albo został już użyty. Poproś o nowy.</div>}
      </div>
    </div>
  );
}
