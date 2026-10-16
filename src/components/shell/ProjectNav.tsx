"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TOOL_ICONS } from "./tool-icons";
import { TOOLS, projectHref, type ToolKey } from "@/lib/nav";

const ICONS = TOOL_ICONS;

const SECTIONS: [string, string][] = [
  ["start", ""],
  ["narzedzia", "Narzędzia"],
  ["dane", "Dane i połączenia"],
];

type Switcher = { id: string; name: string; projects: { id: string; name: string }[] }[];

/** Przełącznik: czyje dane oglądasz (klient → projekt). Narzędzia zostają te same. */
function ProjectSwitcher({ current, clientName, projectName, list }: { current: string; clientName: string; projectName: string; list: Switcher }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname() ?? "";
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  // Przy zmianie projektu zostajemy w tym samym narzędziu.
  const tool = (pathname.split("/")[3] ?? "") as ToolKey | "";
  return (
    <div className="switcher" ref={ref}>
      <span className="switcher-label">Dane klienta</span>
      <button className="switcher-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <b>{clientName}</b>
          <span className="hint">{projectName}</span>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="switcher-menu">
          {list.map((c) => (
            <div key={c.id}>
              <Link href={`/clients/${c.id}`} className="switcher-client" onClick={() => setOpen(false)}>{c.name}</Link>
              {c.projects.map((p) => (
                <button
                  key={p.id}
                  className={p.id === current ? "on" : ""}
                  onClick={() => {
                    setOpen(false);
                    router.push(projectHref(p.id, (tool || "pulpit") as ToolKey));
                  }}
                >
                  {p.name}
                </button>
              ))}
              {!c.projects.length && <span className="hint switcher-empty">brak projektów</span>}
            </div>
          ))}
          <Link href="/" className="switcher-all" onClick={() => setOpen(false)}>Wszyscy klienci →</Link>
        </div>
      )}
    </div>
  );
}

export function ProjectNav({
  projectId, clientName, projectName, list, guideActive,
}: {
  projectId: string;
  clientName: string;
  projectName: string;
  list: Switcher;
  guideActive: boolean;
}) {
  const pathname = usePathname() ?? "";
  const active = (pathname.split("/")[3] ?? "pulpit") as ToolKey;
  return (
    <aside className="proj-nav">
      <ProjectSwitcher current={projectId} clientName={clientName} projectName={projectName} list={list} />
      {SECTIONS.map(([sec, title]) => (
        <nav key={sec} className="proj-nav-sec">
          {title && <div className="proj-nav-title">{title}</div>}
          {TOOLS.filter((t) => t.section === sec).map((t) => {
            const Icon = ICONS[t.key];
            return (
              <Link key={t.key} href={projectHref(projectId, t.key)} className={active === t.key ? "on" : ""} data-tour={`nav-${t.key}`}>
                <Icon size={17} />
                <span>{t.label}</span>
                {t.key === "przewodnik" && guideActive && <span className="dot" title="Przewodnik w toku" />}
              </Link>
            );
          })}
        </nav>
      ))}
    </aside>
  );
}
