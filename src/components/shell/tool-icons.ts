import { ChartColumnBig, Compass, Database, FlaskConical, History, LayoutDashboard, Settings2, Workflow, type LucideIcon } from "lucide-react";
import type { ToolKey } from "@/lib/nav";

export const TOOL_ICONS: Record<ToolKey, LucideIcon> = {
  pulpit: LayoutDashboard,
  lejki: Workflow,
  ekonomia: ChartColumnBig,
  testy: FlaskConical,
  "os-czasu": History,
  dane: Database,
  ustawienia: Settings2,
  przewodnik: Compass,
};
