import { bearer, handleMcp } from "@/lib/mcp/handle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = async (req: Request) => handleMcp(req, bearer(req));

export { handler as GET, handler as POST, handler as DELETE };
