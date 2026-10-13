import { isAuthed } from "@/lib/auth";
import { databaseEnvName, q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Diagnostyka wdrożenia (po zalogowaniu): zmienne środowiskowe i połączenie z bazą. Nie zwraca wartości sekretów. */
export async function GET() {
  if (!(await isAuthed())) return Response.json({ error: "Zaloguj się, aby zobaczyć diagnostykę" }, { status: 401 });
  const dbVar = databaseEnvName();
  const related = Object.keys(process.env).filter((k) => /(^|_)(DATABASE|POSTGRES|NEON)|^PG[A-Z]/.test(k)).sort();
  let database: { ok: boolean; error?: string; tables?: number } = { ok: false };
  try {
    const rows = await q<{ n: string }>(
      "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    database = { ok: true, tables: Number(rows[0]?.n ?? 0) };
  } catch (e) {
    database = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return Response.json({
    env: {
      APP_PASSWORD: !!process.env.APP_PASSWORD,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      databaseVariableUsed: dbVar,
      databaseRelatedVariables: related,
    },
    database,
    deployment: {
      environment: process.env.VERCEL_ENV ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
  });
}
