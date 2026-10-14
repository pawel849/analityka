import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyAiKey } from "../ai-keys";
import { buildMcpServer } from "./server";

/**
 * Jedno żądanie MCP (Streamable HTTP, bez sesji, odpowiedzi JSON). Klucz: w adresie /api/mcp/{klucz}
 * (konektory w claude.ai) albo w nagłówku „Authorization: Bearer {klucz}” (/api/mcp).
 */
export async function handleMcp(req: Request, token: string | null): Promise<Response> {
  if (!(await verifyAiKey(token))) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Nieprawidłowy lub wyłączony klucz dostępu (w aplikacji: „Dostęp dla AI” w górnym pasku)" }, id: null }, { status: 401 });
  }
  const url = new URL(req.url);
  const origin = `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host}`;
  const server = buildMcpServer(origin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Bez sesji: serwer i transport żyją tylko w tym żądaniu.
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}
