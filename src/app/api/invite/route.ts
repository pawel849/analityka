import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, hashPassword, makeToken } from "@/lib/auth";
import { acceptInvite } from "@/lib/access";

/** Ustawienie hasła z linku zaproszenia; po sukcesie osoba jest od razu zalogowana. */
export async function POST(req: Request) {
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token || !password || password.length < 8) return NextResponse.json({ error: "Hasło musi mieć co najmniej 8 znaków" }, { status: 400 });
  const uid = await acceptInvite(token, hashPassword(password));
  if (!uid) return NextResponse.json({ error: "Link wygasł albo został już użyty. Poproś o nowy." }, { status: 410 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(uid), cookieOptions);
  return res;
}
