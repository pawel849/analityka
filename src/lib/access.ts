// Dostęp osób do klientów. Właściciel konta (admin) widzi wszystko, osoba zaproszona – tylko swoich klientów.
import { createHash, randomBytes } from "node:crypto";
import { currentUser, type User } from "./auth";
import { newId, one, q } from "./db";

/** Zapytanie zwracające client_id dla zasobu z adresu /api/<segment>/<id>. */
const OWNER: Record<string, string> = {
  clients: "SELECT id AS c FROM clients WHERE id = $1",
  projects: "SELECT client_id AS c FROM projects WHERE id = $1",
  funnels: "SELECT p.client_id AS c FROM funnels f JOIN projects p ON p.id = f.project_id WHERE f.id = $1",
  loops: "SELECT p.client_id AS c FROM loops l JOIN projects p ON p.id = l.project_id WHERE l.id = $1",
  reports: "SELECT p.client_id AS c FROM loops l JOIN projects p ON p.id = l.project_id WHERE l.id = $1",
  decisions: "SELECT p.client_id AS c FROM decisions d JOIN projects p ON p.id = d.project_id WHERE d.id = $1",
  tasks: "SELECT p.client_id AS c FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1",
  "ad-tests": "SELECT p.client_id AS c FROM ad_tests t JOIN projects p ON p.id = t.project_id WHERE t.id = $1",
  "ad-test-rounds":
    "SELECT p.client_id AS c FROM ad_test_rounds r JOIN ad_tests t ON t.id = r.test_id JOIN projects p ON p.id = t.project_id WHERE r.id = $1",
  "ad-test-variants":
    "SELECT p.client_id AS c FROM ad_test_variants v JOIN ad_test_rounds r ON r.id = v.round_id JOIN ad_tests t ON t.id = r.test_id JOIN projects p ON p.id = t.project_id WHERE v.id = $1",
};

/** API tylko dla właściciela konta. */
const ADMIN_ONLY = new Set(["ai-keys", "assistant", "cron", "health"]);

export async function clientIdsOf(u: User): Promise<string[] | null> {
  if (u.admin) return null;
  return (await q<{ client_id: string }>("SELECT client_id FROM client_members WHERE user_id = $1", [u.id])).map((r) => r.client_id);
}

export async function canClient(u: User, clientId: string | null | undefined): Promise<boolean> {
  if (u.admin) return true;
  if (!clientId) return false;
  return !!(await one("SELECT 1 FROM client_members WHERE user_id = $1 AND client_id = $2", [u.id, clientId]));
}

/** Sprawdza dostęp do zasobu z adresu API. "ok" | "forbidden" | "missing". */
export async function apiAccess(u: User, pathname: string, method: string): Promise<"ok" | "forbidden" | "missing"> {
  if (u.admin) return "ok";
  const [, api, seg, id, sub] = pathname.split("/");
  if (api !== "api" || !seg) return "ok";
  if (ADMIN_ONLY.has(seg) || (seg === "clients" && sub === "members")) return "forbidden";
  // Tworzenie i usuwanie klientów zostaje u właściciela konta.
  if (seg === "clients" && (!id || method === "DELETE")) return method === "GET" && !id ? "ok" : "forbidden";
  const sql = OWNER[seg];
  if (!sql || !id) return "ok";
  const row = await one<{ c: string }>(sql, [decodeURIComponent(id)]);
  return row && (await canClient(u, row.c)) ? "ok" : "missing";
}

export async function canProject(u: User, projectId: unknown): Promise<boolean> {
  if (u.admin) return true;
  if (typeof projectId !== "string") return false;
  const row = await one<{ client_id: string }>("SELECT client_id FROM projects WHERE id = $1", [projectId]);
  return canClient(u, row?.client_id);
}

/** Dla stron: true, gdy zalogowana osoba ma dostęp do klienta. */
export async function viewerCanClient(clientId: string): Promise<boolean> {
  const u = await currentUser();
  return !!u && canClient(u, clientId);
}

// ——— Zarządzanie osobami (tylko admin) ———

export interface Member {
  id: string;
  email: string;
  active: boolean;
  added_at: string;
}

const INVITE_DAYS = 7;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function listMembers(clientId: string): Promise<Member[]> {
  return q<Member>(
    `SELECT u.id, u.email, (u.pw_hash IS NOT NULL) AS active, m.created_at AS added_at
     FROM client_members m JOIN users u ON u.id = m.user_id WHERE m.client_id = $1 ORDER BY m.created_at`,
    [clientId],
  );
}

/** Nowy jednorazowy link do ustawienia hasła (ważny 7 dni). Zwraca token w postaci jawnej – zapisujemy tylko skrót. */
export async function newInvite(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await q(`UPDATE users SET invite_hash = $2, invite_expires = now() + interval '${INVITE_DAYS} days' WHERE id = $1`, [userId, hashToken(token)]);
  return token;
}

/** Dodaje osobę (po e-mailu) do klienta. Link zwracany, gdy osoba nie ma jeszcze hasła. */
export async function addMember(clientId: string, email: string): Promise<{ member: Member; invite: string | null }> {
  let u = await one<{ id: string; pw_hash: string | null }>("SELECT id, pw_hash FROM users WHERE email = $1", [email]);
  if (!u) u = await one<{ id: string; pw_hash: string | null }>("INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id, pw_hash", [newId(), email]);
  await q("INSERT INTO client_members (client_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [clientId, u!.id]);
  const invite = u!.pw_hash ? null : await newInvite(u!.id);
  const member = (await listMembers(clientId)).find((m) => m.id === u!.id)!;
  return { member, invite };
}

/** Usuwa osobę z klienta; osoba bez żadnego klienta jest usuwana całkiem. */
export async function removeMember(clientId: string, userId: string): Promise<void> {
  await q("DELETE FROM client_members WHERE client_id = $1 AND user_id = $2", [clientId, userId]);
  await q("DELETE FROM users WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM client_members WHERE user_id = $1)", [userId]);
}

export async function inviteUser(token: string): Promise<{ id: string; email: string } | null> {
  return one<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE invite_hash = $1 AND invite_expires > now()",
    [hashToken(token)],
  );
}

export async function acceptInvite(token: string, pwHash: string): Promise<string | null> {
  const u = await inviteUser(token);
  if (!u) return null;
  await q("UPDATE users SET pw_hash = $2, invite_hash = NULL, invite_expires = NULL WHERE id = $1", [u.id, pwHash]);
  return u.id;
}
