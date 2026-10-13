import { NextResponse } from "next/server";
import { checkPassword, COOKIE, cookieOptions, makeToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "Nieprawidłowe hasło" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(), cookieOptions);
  return res;
}
