import { NextResponse } from "next/server";
import { checkPassword, COOKIE, cookieOptions, makeToken, passwordMatches } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { one } from "@/lib/db";

/** E-mail + hasło osoby zaproszonej. Bez e-maila (albo e-mail spoza bazy) – hasło właściciela konta (APP_PASSWORD). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const password = b.password ?? "";
  const email = normalizeEmail(b.email);
  const fail = NextResponse.json({ error: "Nieprawidłowy e-mail lub hasło" }, { status: 401 });
  if (!password) return fail;
  const u = email ? await one<{ id: string; pw_hash: string | null }>("SELECT id, pw_hash FROM users WHERE email = $1", [email]) : null;
  let uid: string | undefined;
  if (u && passwordMatches(password, u.pw_hash)) uid = u.id;
  else if (!u && checkPassword(password)) uid = "admin";
  if (!uid) return fail;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(uid), cookieOptions);
  return res;
}
