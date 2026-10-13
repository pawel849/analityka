// Szablony map lejków (własne układy). Strategia = gotowe lejki do zaplanowania,
// Analiza = mapy budowane z danych projektu (patrz components/editor/TemplatePicker).
import { CATALOG_BY_KIND, type NodeData } from "./catalog";

export interface TemplateNode {
  id: string;
  type: "funnel";
  position: { x: number; y: number };
  data: NodeData;
}
export interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  type: "flow";
  markerEnd: { type: "arrowclosed" };
  data?: { connection?: "direct" | "indirect" | "none" };
}
export interface Template {
  key: string;
  name: string;
  description: string;
  build: () => { nodes: TemplateNode[]; edges: TemplateEdge[] };
}

type Step = [key: string, kind: string, col: number, row: number, patch?: Partial<NodeData>];

const COL = 260;
const ROW = 190;

export function buildGraph(steps: Step[], links: [string, string, ("direct" | "indirect")?][]) {
  const suffix = Math.random().toString(36).slice(2, 7);
  const id = (k: string) => `${k}_${suffix}`;
  const nodes: TemplateNode[] = steps.map(([key, kind, col, row, patch]) => {
    const item = CATALOG_BY_KIND[kind];
    return {
      id: id(key),
      type: "funnel",
      position: { x: col * COL, y: row * ROW },
      data: { kind, category: item.category, label: item.label, ...item.defaults, ...patch },
    };
  });
  const edges: TemplateEdge[] = links.map(([a, b, conn], i) => ({
    id: `e${i}_${suffix}`,
    source: id(a),
    target: id(b),
    type: "flow",
    markerEnd: { type: "arrowclosed" },
    ...(conn ? { data: { connection: conn } } : {}),
  }));
  return { nodes, edges };
}

export const STRATEGY_TEMPLATES: Template[] = [
  {
    key: "lead_magnet",
    name: "Lejek z lead magnetem",
    description: "Pozyskanie zapisów",
    build: () =>
      buildGraph(
        [
          ["ads", "meta_ads", 0, 0],
          ["optin", "optin", 1, 0, { label: "Strona zapisu", url: "/zapis" }],
          ["lead", "lead", 2, 0, { label: "Zapis", goal: true, goalName: "Lead" }],
          ["ty", "download", 3, 0, { label: "Pobranie materiału", url: "/pobierz" }],
          ["mail", "email", 3, 1, { label: "Sekwencja e-mail" }],
          ["sales", "sales", 4, 1, { label: "Oferta", url: "/oferta" }],
          ["buy", "purchase", 5, 1, { label: "Zakup", goal: true, goalName: "Sprzedaż" }],
        ],
        [["ads", "optin"], ["optin", "lead"], ["lead", "ty"], ["mail", "sales"], ["sales", "buy"]],
      ),
  },
  {
    key: "survey",
    name: "Lejek z ankietą",
    description: "Segmentacja odbiorców",
    build: () =>
      buildGraph(
        [
          ["ads", "meta_ads", 0, 1],
          ["survey", "application", 1, 1, { label: "Ankieta", url: "/ankieta" }],
          ["a", "sales", 2, 0, { label: "Oferta – segment A", url: "/oferta-a" }],
          ["b", "sales", 2, 1, { label: "Oferta – segment B", url: "/oferta-b" }],
          ["c", "sales", 2, 2, { label: "Oferta – segment C", url: "/oferta-c" }],
          ["buyA", "purchase", 3, 0, { label: "Zakup A", pageUrl: "/oferta-a" }],
          ["buyB", "purchase", 3, 1, { label: "Zakup B", pageUrl: "/oferta-b" }],
          ["buyC", "purchase", 3, 2, { label: "Zakup C", pageUrl: "/oferta-c" }],
        ],
        [["ads", "survey"], ["survey", "a"], ["survey", "b"], ["survey", "c"], ["a", "buyA"], ["b", "buyB"], ["c", "buyC"]],
      ),
  },
  {
    key: "webinar",
    name: "Lejek webinarowy",
    description: "Sprzedaż przez webinar",
    build: () =>
      buildGraph(
        [
          ["ads", "meta_ads", 0, 0],
          ["mail", "email", 0, 1],
          ["reg", "webinar_reg", 1, 0, { label: "Rejestracja", url: "/webinar" }],
          ["lead", "lead", 2, 0, { label: "Zapis", goal: true, goalName: "Rejestracja" }],
          ["ty", "thankyou", 3, 0, { label: "Potwierdzenie", url: "/webinar-dzieki" }],
          ["live", "webinar", 4, 0, { label: "Webinar na żywo", url: "/live" }],
          ["replay", "replay", 4, 1, { label: "Powtórka", url: "/powtorka" }],
          ["offer", "sales", 5, 0, { label: "Oferta", url: "/oferta" }],
          ["order", "checkout", 6, 0, { label: "Zamówienie", url: "/zamowienie" }],
          ["buy", "purchase", 7, 0, { label: "Zakup", goal: true, goalName: "Sprzedaż" }],
        ],
        [["ads", "reg"], ["mail", "reg"], ["reg", "lead"], ["lead", "ty"], ["ty", "live", "indirect"], ["ty", "replay", "indirect"], ["live", "offer"], ["replay", "offer"], ["offer", "order"], ["order", "buy"]],
      ),
  },
  {
    key: "mini_class",
    name: "Mini-kurs wideo",
    description: "Sprzedaż przez serię wideo",
    build: () =>
      buildGraph(
        [
          ["ads", "meta_ads", 0, 0],
          ["optin", "optin", 1, 0, { label: "Zapis na mini-kurs", url: "/mini-kurs" }],
          ["lead", "lead", 2, 0, { label: "Zapis", goal: true, goalName: "Lead" }],
          ["v1", "vsl", 3, 0, { label: "Wideo 1", url: "/lekcja-1" }],
          ["v2", "vsl", 4, 0, { label: "Wideo 2", url: "/lekcja-2" }],
          ["v3", "vsl", 5, 0, { label: "Wideo 3", url: "/lekcja-3" }],
          ["offer", "sales", 6, 0, { label: "Oferta", url: "/oferta" }],
          ["buy", "purchase", 7, 0, { label: "Zakup", goal: true, goalName: "Sprzedaż" }],
        ],
        [["ads", "optin"], ["optin", "lead"], ["lead", "v1"], ["v1", "v2", "indirect"], ["v2", "v3", "indirect"], ["v3", "offer"], ["offer", "buy"]],
      ),
  },
  {
    key: "product",
    name: "Sprzedaż produktu",
    description: "Z upsellem i downsellem",
    build: () =>
      buildGraph(
        [
          ["ads", "meta_ads", 0, 0],
          ["google", "google_ads", 0, 1],
          ["sales", "sales", 1, 0, { label: "Strona sprzedażowa", url: "/oferta" }],
          ["order", "checkout", 2, 0, { label: "Zamówienie", url: "/zamowienie" }],
          ["buy", "purchase", 3, 0, { label: "Zakup", goal: true, goalName: "Sprzedaż" }],
          ["up", "upsell", 4, 0, { label: "Upsell", url: "/upsell" }],
          ["down", "downsell", 4, 1, { label: "Downsell", url: "/downsell" }],
          ["ty", "thankyou", 5, 0, { label: "Podziękowanie", url: "/dziekujemy" }],
        ],
        [["ads", "sales"], ["google", "sales"], ["sales", "order"], ["order", "buy"], ["buy", "up"], ["up", "ty"], ["up", "down"], ["down", "ty"]],
      ),
  },
  {
    key: "application",
    name: "Lejek aplikacyjny",
    description: "Kwalifikacja klientów premium",
    build: () =>
      buildGraph(
        [
          ["ads", "meta_ads", 0, 0],
          ["vsl", "vsl", 1, 0, { label: "VSL", url: "/vsl" }],
          ["app", "application", 2, 0, { label: "Aplikacja", url: "/aplikacja" }],
          ["book", "booking", 3, 0, { label: "Rezerwacja rozmowy", url: "/kalendarz" }],
          ["booked", "booking_done", 4, 0, { label: "Umówiona rozmowa", goal: true, goalName: "Rozmowa" }],
          ["call", "call", 5, 0, { label: "Rozmowa sprzedażowa" }],
          ["won", "meeting", 6, 0, { label: "Klient (sprzedaż)" }],
        ],
        [["ads", "vsl"], ["vsl", "app"], ["app", "book"], ["book", "booked"], ["booked", "call"], ["call", "won"]],
      ),
  },
];
