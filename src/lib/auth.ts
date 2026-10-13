import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const COOKIE = "anl_session";
const MAX_AGE = 60 * 60 * 24 * 30;

/** W trybie lokalnym bez APP_PASSWORD logowanie jest wyłączone. W produkcji hasło jest wymagane. */
export function authDisabled(): boolean {
  return !process.env.APP_PASSWORD && process.env.NODE_ENV !== "production";
}

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  if (!s) throw new Error("Ustaw APP_PASSWORD i AUTH_SECRET w zmiennych środowiskowych.");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeToken(): string {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkPassword(pw: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(sign(pw));
  const b = Buffer.from(sign(expected));
  return timingSafeEqual(a, b);
}

export async function isAuthed(): Promise<boolean> {
  if (authDisabled()) return true;
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

/** Dla stron: przekierowanie na logowanie. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) redirect("/login");
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};
