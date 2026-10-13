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
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    driver = { query: (sql, params) => pool.query(sql, params as unknown[]) as never };
  } else {
    if (process.env.VERCEL) {
      throw new Error("Brak DATABASE_URL – podłącz bazę Postgres (np. Neon) w ustawieniach projektu Vercel.");
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(process.env.PGLITE_DIR ?? "./.data/pglite");
    driver = { query: (sql, params) => pg.query(sql, params) as never };
  }
  for (const stmt of SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await driver.query(stmt);
  }
  return driver;
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
