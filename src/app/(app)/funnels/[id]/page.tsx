import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { FunnelEditor, type EditorProps } from "@/components/editor/FunnelEditor";

export default async function FunnelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await one<{
    id: string;
    name: string;
    graph: EditorProps["funnel"]["graph"] | string;
    project_id: string;
    project_name: string;
    tracking_key: string;
    client_id: string;
    client_name: string;
  }>(
    `SELECT f.id, f.name, f.graph, p.id AS project_id, p.name AS project_name, p.tracking_key, c.id AS client_id, c.name AS client_name
     FROM funnels f JOIN projects p ON p.id = f.project_id JOIN clients c ON c.id = p.client_id WHERE f.id = $1`,
    [id],
  );
  if (!row) notFound();
  const graph = typeof row.graph === "string" ? JSON.parse(row.graph) : row.graph;
  return (
    <FunnelEditor
      funnel={{ id: row.id, name: row.name, graph }}
      project={{ id: row.project_id, name: row.project_name, trackingKey: row.tracking_key }}
      client={{ id: row.client_id, name: row.client_name }}
    />
  );
}
