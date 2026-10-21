import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

export const ADMIN = "admin";

/** Token sesji: „wygaśnięcie.uid.podpis”. uid = „admin” albo id osoby z tabeli users. */
export function makeToken(uid: string = ADMIN): string {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${uid}.${sign(`${exp}.${uid}`)}`;
}

/** Zwraca uid z ważnego tokenu albo null. Stary format „wygaśnięcie.podpis” = admin. */
export function tokenUid(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  const [exp, uid, sig] = parts.length === 2 ? [parts[0], ADMIN, parts[1]] : parts;
  if (parts.length > 3 || !exp || !uid || !sig || Number(exp) < Date.now()) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(parts.length === 2 ? exp : `${exp}.${uid}`));
  return a.length === b.length && timingSafeEqual(a, b) ? uid : null;
}

export function verifyToken(token: string | undefined): boolean {
  return tokenUid(token) !== null;
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `${salt}.${scryptSync(pw, salt, 32).toString("base64url")}`;
}

export function passwordMatches(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(".");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "base64url");
  const b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkPassword(pw: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(sign(pw));
  const b = Buffer.from(sign(expected));
  return timingSafeEqual(a, b);
}

export type User = { admin: true; id: typeof ADMIN; email: null } | { admin: false; id: string; email: string };
const ADMIN_USER: User = { admin: true, id: ADMIN, email: null };

/** Zalogowana osoba albo null. Osoba usunięta z bazy traci dostęp od razu. */
export async function currentUser(): Promise<User | null> {
  if (authDisabled()) return ADMIN_USER;
  const uid = tokenUid((await cookies()).get(COOKIE)?.value);
  if (!uid) return null;
  if (uid === ADMIN) return ADMIN_USER;
  const { one } = await import("./db");
  const u = await one<{ id: string; email: string }>("SELECT id, email FROM users WHERE id = $1 AND pw_hash IS NOT NULL", [uid]);
  return u ? { admin: false, id: u.id, email: u.email } : null;
}

export async function isAuthed(): Promise<boolean> {
  return (await currentUser()) !== null;
}

export async function isAdmin(): Promise<boolean> {
  return (await currentUser())?.admin === true;
}

/** Dla stron: przekierowanie na logowanie. */
export async function requireAuth(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Dla stron tylko dla właściciela konta. */
export async function requireAdmin(): Promise<void> {
  const u = await requireAuth();
  if (!u.admin) redirect("/");
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};
