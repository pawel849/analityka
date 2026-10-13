import { SCHEMA_SQL } from "./schema";

type Row = Record<string, unknown>;
interface Driver {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const g = globalThis as unknown as { __anlDb?: Promise<Driver> };

async function connect(): Promise<Driver> {
  let driver: Driver;
  // Vercel/Neon mogą nazwać zmienną różnie – bierzemy pierwszą dostępną.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;
  if (url || process.env.PGHOST) {
    const { Pool } = await import("pg");
    // Bez adresu URL sterownik pg sam czyta PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
    const local = (url ?? process.env.PGHOST ?? "").includes("localhost");
    const pool = new Pool({
      ...(url ? { connectionString: url } : {}),
      max: 5,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
    driver = { query: (sql, params) => pool.query(sql, params as unknown[]) as never };
  } else {
    if (process.env.VERCEL) {
      throw new Error("Brak zmiennych bazy w tym wdrożeniu. Podłącz bazę (Storage → Neon) i zrób Redeploy – zmienne działają tylko we wdrożeniach utworzonych po ich dodaniu.");
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(process.env.PGLITE_DIR ?? "./.data/pglite");
    driver = { query: (sql, params) => pg.query(sql, params) as never };
  }
  for (const stmt of SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    try {
      await driver.query(stmt);
    } catch (e) {
      // Równoległe zimne starty mogą tworzyć te same tabele naraz – „już istnieje” ignorujemy.
      const code = (e as { code?: string }).code;
      if (code !== "42P07" && code !== "23505" && code !== "42701") throw e;
    }
  }
  return driver;
}

/** Nazwa zmiennej z adresem bazy, która zostanie użyta (do diagnostyki). */
export function databaseEnvName(): string | null {
  for (const k of ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED"]) if (process.env[k]) return k;
  return process.env.PGHOST ? "PGHOST/PGUSER/PGPASSWORD/PGDATABASE" : null;
}

export function db(): Promise<Driver> {
  if (!g.__anlDb) {
    g.__anlDb = connect().catch((e) => {
      g.__anlDb = undefined;
      throw e;
    });
  }
  return g.__anlDb;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await db();
  const res = await d.query<T>(sql, params);
  return res.rows;
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function newKey(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
