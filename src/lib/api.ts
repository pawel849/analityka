import { NextResponse } from "next/server";
import { isAuthed } from "./auth";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Owija handler API: wymaga zalogowania i zamienia wyjątki na JSON z błędem. */
export function guarded<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    if (!(await isAuthed())) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    try {
      return await fn(req, ctx);
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "Błąd serwera" }, { status: 500 });
    }
  };
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const notFound = () => NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export type Params<K extends string> = { params: Promise<Record<K, string>> };
