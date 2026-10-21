import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { viewerCanClient } from "@/lib/access";
import { requireAuth } from "@/lib/auth";
import { FunnelEditor, type EditorProps } from "@/components/editor/FunnelEditor";

export const dynamic = "force-dynamic";

/** Mapa lejka tylko do podglądu (osadzana w raporcie) – po zalogowaniu, bez nagłówka aplikacji. */
export default async function MapView({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const row = await one<{
    id: string; name: string; graph: EditorProps["funnel"]["graph"] | string; project_id: string; project_name: string; client_id: string; client_name: string;
  }>(
    `SELECT f.id, f.name, f.graph, p.id AS project_id, p.name AS project_name, c.id AS client_id, c.name AS client_name
     FROM funnels f JOIN projects p ON p.id = f.project_id JOIN clients c ON c.id = p.client_id WHERE f.id = $1`,
    [id],
  );
  if (!row || !(await viewerCanClient(row.client_id))) notFound();
  const graph = typeof row.graph === "string" ? JSON.parse(row.graph) : row.graph;
  return (
    <FunnelEditor
      readOnly
      funnel={{ id: row.id, name: row.name, graph }}
      project={{ id: row.project_id, name: row.project_name, trackingKey: "" }}
      client={{ id: row.client_id, name: row.client_name }}
    />
  );
}
