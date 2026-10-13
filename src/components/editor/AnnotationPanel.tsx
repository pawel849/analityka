"use client";
import type { Node } from "@xyflow/react";
import { WIDGETS, type ShapeData, type TextData, type WidgetData } from "./annotations";

type Action = "copy" | "duplicate" | "forward" | "front" | "backward" | "back";

const TYPE_LABEL: Record<string, string> = { text: "Tekst", shape: "Kształt", image: "Obraz", widget: "Widget" };

export function AnnotationPanel({
  node,
  onChange,
  onDelete,
  onAction,
}: {
  node: Node;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onAction: (a: Action) => void;
}) {
  const d = node.data as Record<string, unknown>;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <b>{TYPE_LABEL[node.type ?? ""] ?? "Element"}</b>
        <button className="btn small danger" onClick={onDelete}>Usuń</button>
      </div>

      {node.type === "text" && <TextFields d={d as TextData} onChange={onChange} />}
      {node.type === "shape" && <ShapeFields d={d as ShapeData} onChange={onChange} />}
      {node.type === "image" && (
        <label className="field">
          Adres obrazka (URL)
          <input value={(d.src as string) ?? ""} placeholder="https://…/obraz.png" onChange={(e) => onChange({ src: e.target.value })} autoFocus />
          <span className="hint">Rozmiar zmienisz, przeciągając narożniki zaznaczonego obrazka.</span>
        </label>
      )}
      {node.type === "widget" && <WidgetFields d={d as WidgetData} onChange={onChange} />}

      <div className="field">
        Kolejność i kopiowanie
        <div className="choice-grid">
          <button className="btn small" onClick={() => onAction("copy")}>Kopiuj</button>
          <button className="btn small" onClick={() => onAction("duplicate")}>Duplikuj</button>
          <button className="btn small" onClick={() => onAction("front")}>Na wierzch</button>
          <button className="btn small" onClick={() => onAction("back")}>Na spód</button>
        </div>
      </div>
    </div>
  );
}

function TextFields({ d, onChange }: { d: TextData; onChange: (p: Partial<TextData>) => void }) {
  return (
    <>
      <label className="field">
        Treść
        <textarea rows={4} value={d.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} autoFocus />
      </label>
      <div className="manual-row">
        <label className="field">
          Rozmiar
          <select value={d.size ?? 24} onChange={(e) => onChange({ size: Number(e.target.value) })}>
            {[12, 14, 16, 18, 20, 24, 32, 40, 48, 64, 80].map((s) => <option key={s} value={s}>{s}px</option>)}
          </select>
        </label>
        <label className="field">
          Kolor
          <input type="color" value={d.color || "#1d3a7a"} onChange={(e) => onChange({ color: e.target.value })} style={{ height: 34, padding: 2 }} />
        </label>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`btn small ${d.bold ? "primary" : ""}`} onClick={() => onChange({ bold: !d.bold })}><b>B</b></button>
        <button className={`btn small ${d.italic ? "primary" : ""}`} onClick={() => onChange({ italic: !d.italic })}><i>I</i></button>
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} className={`btn small ${(d.align ?? "left") === a ? "primary" : ""}`} onClick={() => onChange({ align: a })}>
            {a === "left" ? "Do lewej" : a === "center" ? "Środek" : "Do prawej"}
          </button>
        ))}
      </div>
      <label className="field">
        Link (opcjonalnie)
        <input value={d.link ?? ""} placeholder="https://…" onChange={(e) => onChange({ link: e.target.value })} />
      </label>
    </>
  );
}

function ShapeFields({ d, onChange }: { d: ShapeData; onChange: (p: Partial<ShapeData>) => void }) {
  const transparent = !d.fill || d.fill === "transparent";
  return (
    <>
      <label className="field">
        Kształt
        <select value={d.shape} onChange={(e) => onChange({ shape: e.target.value as ShapeData["shape"] })}>
          <option value="rect">Prostokąt</option>
          <option value="ellipse">Elipsa</option>
          <option value="diamond">Romb</option>
        </select>
      </label>
      <label className="field">
        Podpis
        <input value={d.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="np. Etap 1 – pozyskanie" />
      </label>
      <div className="manual-row">
        <label className="field">
          Wypełnienie
          <input type="color" value={transparent ? "#e6ebf6" : d.fill} onChange={(e) => onChange({ fill: e.target.value })} style={{ height: 34, padding: 2 }} />
        </label>
        <label className="field">
          Obramowanie
          <input type="color" value={d.stroke || "#1d3a7a"} onChange={(e) => onChange({ stroke: e.target.value })} style={{ height: 34, padding: 2 }} />
        </label>
      </div>
      {!transparent && (
        <button className="btn small" style={{ marginBottom: 10 }} onClick={() => onChange({ fill: "transparent" })}>Bez wypełnienia</button>
      )}
      <p className="hint">Rozmiar zmienisz, przeciągając narożniki zaznaczonego kształtu.</p>
    </>
  );
}

function WidgetFields({ d, onChange }: { d: WidgetData; onChange: (p: Partial<WidgetData>) => void }) {
  return (
    <>
      <label className="field">
        Widget
        <select value={d.widget} onChange={(e) => onChange({ widget: e.target.value as WidgetData["widget"] })}>
          {WIDGETS.map((w) => <option key={w.kind} value={w.kind}>{w.label}</option>)}
        </select>
      </label>
      {d.widget === "trends" && (
        <label className="field">
          Metryka
          <select value={d.metric ?? "visitors"} onChange={(e) => onChange({ metric: e.target.value as WidgetData["metric"] })}>
            <option value="visitors">Odwiedzający</option>
            <option value="leads">Leady</option>
            <option value="sales">Sprzedaże</option>
            <option value="revenue">Przychód</option>
          </select>
        </label>
      )}
      {d.widget === "countries" && <p className="hint">Kraj zapisuje się na podstawie nagłówka geolokalizacji Vercel – lokalnie będzie „Nieznany”.</p>}
    </>
  );
}
