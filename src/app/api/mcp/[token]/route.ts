import { bearer, handleMcp } from "@/lib/mcp/handle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };
const handler = async (req: Request, { params }: Ctx) => handleMcp(req, (await params).token || bearer(req));

export { handler as GET, handler as POST, handler as DELETE };
