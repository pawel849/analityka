"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCsv, type ParsedCsv } from "@/lib/csv";
import {
  autoMap,
  fieldsFor,
  hashEmail,
  normalizeAds,
  normalizeOrders,
  PRESETS,
  type ImportKind,
  type Preset,
} from "@/lib/importing";
import { api } from "../forms";

interface ImportRow {
  id: string;
  kind: ImportKind;
  source: string;
  filename: string;
  rows: number;
  created_at: string;
}

const fmt = (n: number) => n.toLocaleString("pl-PL", { maximumFractionDigits: 2 });

export function ImportPanel({ projectId }: { projectId: string }) {
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [source, setSource] = useState("");
  const [encoding, setEncoding] = useState("utf-8");
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [paidStatuses, setPaidStatuses] = useState("");
  const [separator, setSeparator] = useState(",");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const kind = preset.kind;
  const fields = fieldsFor(kind);

  const loadImports = useCallback(() => {
    api<ImportRow[]>(`/api/projects/${projectId}/imports`).then(setImports).catch(() => {});
  }, [projectId]);
  useEffect(loadImports, [loadImports]);

  const readFile = useCallback(
    async (f: File, enc: string, p: Preset) => {
      setErr("");
      setMsg("");
      const buf = await f.arrayBuffer();
      const text = new TextDecoder(enc).decode(buf);
      const parsed = parseCsv(text);
      if (!parsed.headers.length) {
        setErr("Nie udało się odczytać nagłówków – sprawdź, czy to plik CSV.");
        return;
      }
      setCsv(parsed);
      setMap(autoMap(p.kind, parsed.headers));
    },
    [],
  );

  useEffect(() => {
    setPaidStatuses(preset.paidStatuses ?? "");
    setSeparator(preset.productSeparator ?? ",");
    if (!source) setSource(preset.kind === "orders" ? preset.key.replace("_other", "") : "");
    if (file) readFile(file, encoding, preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const normalized = useMemo(() => {
    if (!csv) return null;
    return kind === "ads"
      ? normalizeAds(csv.rows, map)
      : normalizeOrders(csv.rows, map, { paidStatuses, productSeparator: separator });
  }, [csv, map, kind, paidStatuses, separator]);

  const missing = fields.filter((f) => f.required && map[f.key] == null);

  async function runImport() {
    if (!normalized || !normalized.rows.length) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      let importId: string | undefined;
      const all = normalized.rows;
      const CHUNK = 1000;
      for (let i = 0; i < all.length; i += CHUNK) {
        let chunk: unknown[] = all.slice(i, i + CHUNK);
        if (kind === "orders") {
          chunk = await Promise.all(
            (chunk as ReturnType<typeof normalizeOrders>["rows"]).map(async ({ email, ...o }) => ({ ...o, customer: await hashEmail(email) })),
          );
        }
        const r = await api<{ import_id: string }>(`/api/projects/${projectId}/imports`, "POST", {
          import_id: importId,
          kind,
          source: kind === "orders" ? source || preset.key : preset.key,
          filename: file?.name ?? "",
          rows: chunk,
        });
        importId = r.import_id;
        setMsg(`Zaimportowano ${Math.min(i + CHUNK, all.length)} / ${all.length}…`);
      }
      setMsg(`Gotowe: ${all.length} ${kind === "ads" ? "wierszy reklam" : "zamówień"}. Pominięto ${normalized.skipped}.`);
      setCsv(null);
      setFile(null);
      loadImports();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Import danych</h2>

      <div className="card">
        <div className="map-grid">
          <label className="field">
            Rodzaj danych i źródło
            <select value={preset.key} onChange={(e) => setPreset(PRESETS.find((p) => p.key === e.target.value)!)}>
              <optgroup label="Reklamy">
                {PRESETS.filter((p) => p.kind === "ads").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </optgroup>
              <optgroup label="Zamówienia">
                {PRESETS.filter((p) => p.kind === "orders").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </optgroup>
            </select>
          </label>
          {kind === "orders" && (
            <label className="field">
              Nazwa sklepu (rozróżnia numery zamówień)
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="np. woocommerce" />
            </label>
          )}
          <label className="field">
            Kodowanie pliku
            <select value={encoding} onChange={(e) => { setEncoding(e.target.value); if (file) readFile(file, e.target.value, preset); }}>
              <option value="utf-8">UTF-8 (najczęściej)</option>
              <option value="windows-1250">Windows-1250 (Excel PL)</option>
              <option value="utf-16le">UTF-16</option>
            </select>
          </label>
          <label className="field">
            Plik CSV
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) readFile(f, encoding, preset);
              }}
            />
          </label>
        </div>
        <p className="hint">{preset.note}</p>
      </div>

      {csv && normalized && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Dopasowanie kolumn ({csv.rows.length} wierszy, separator „{csv.delimiter === "\t" ? "tab" : csv.delimiter}”)</h3>
          <div className="map-grid">
            {fields.map((f) => (
              <label key={f.key} className="field">
                {f.label}
                {f.required ? " *" : ""}
                <select
                  value={map[f.key] ?? ""}
                  onChange={(e) => setMap({ ...map, [f.key]: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value) })}
                >
                  <option value="">— brak —</option>
                  {csv.headers.map((h, i) => <option key={i} value={i}>{h || `(kolumna ${i + 1})`}</option>)}
                </select>
              </label>
            ))}
            {kind === "orders" && (
              <>
                <label className="field">
                  Statusy uznawane za opłacone (po przecinku, puste = wszystkie)
                  <input value={paidStatuses} onChange={(e) => setPaidStatuses(e.target.value)} />
                </label>
                <label className="field">
                  Separator produktów w jednej komórce
                  <select value={separator} onChange={(e) => setSeparator(e.target.value)}>
                    <option value=",">przecinek</option>
                    <option value=";">średnik</option>
                    <option value="|">kreska |</option>
                    <option value="\n">nowa linia</option>
                    <option value="">brak (cała komórka = 1 produkt)</option>
                  </select>
                </label>
              </>
            )}
          </div>
          {missing.length > 0 && <p className="error">Dopasuj wymagane pola: {missing.map((f) => f.label).join(", ")}.</p>}

          <h3 style={{ marginTop: 14 }}>
            Podgląd po przetworzeniu: {normalized.rows.length} {kind === "ads" ? "wierszy" : "zamówień"}, pominięto {normalized.skipped}
          </h3>
          <div className="tbl-wrap">
            {kind === "ads" ? (
              <table className="tbl">
                <thead>
                  <tr><th>Okres</th><th>Kampania</th><th>Reklama</th><th className="num">Wydatki</th><th className="num">Wyśw.</th><th className="num">Klik.</th><th className="num">Zakupy</th></tr>
                </thead>
                <tbody>
                  {(normalized.rows as ReturnType<typeof normalizeAds>["rows"]).slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <td>{r.period_start}{r.period_end !== r.period_start ? ` – ${r.period_end}` : ""}</td>
                      <td>{r.campaign}</td>
                      <td>{r.ad}</td>
                      <td className="num">{fmt(r.spend)}</td>
                      <td className="num">{fmt(r.impressions)}</td>
                      <td className="num">{fmt(r.clicks)}</td>
                      <td className="num">{fmt(r.purchases)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="tbl">
                <thead>
                  <tr><th>Nr</th><th>Data</th><th>Klient</th><th>Produkty</th><th className="num">Kwota</th></tr>
                </thead>
                <tbody>
                  {(normalized.rows as ReturnType<typeof normalizeOrders>["rows"]).slice(0, 8).map((r) => (
                    <tr key={r.order_ref}>
                      <td>{r.order_ref}</td>
                      <td>{r.ts.slice(0, 10)}</td>
                      <td>{r.email ? "✓ e-mail" : "—"}</td>
                      <td>{r.products.map((p) => p.name + (p.price != null ? ` (${fmt(p.price)})` : "")).join(", ") || "—"}</td>
                      <td className="num">{fmt(r.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={busy || missing.length > 0 || !normalized.rows.length} onClick={runImport}>
              {busy ? "Importuję…" : `Importuj ${normalized.rows.length}`}
            </button>
            <span className="hint">Ponowny import tych samych danych nadpisze je (bez duplikatów).</span>
          </div>
        </div>
      )}
      {msg && <p className="hint">{msg}</p>}
      {err && <p className="error">{err}</p>}

      <div className="section">
        <h3>Zaimportowane pliki</h3>
        {imports.length === 0 ? (
          <p className="hint">Brak importów.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Data</th><th>Rodzaj</th><th>Źródło</th><th>Plik</th><th className="num">Wiersze</th><th /></tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id}>
                  <td>{new Date(i.created_at).toLocaleString("pl-PL")}</td>
                  <td>{i.kind === "ads" ? "Reklamy" : "Zamówienia"}</td>
                  <td>{i.source}</td>
                  <td>{i.filename}</td>
                  <td className="num">{fmt(i.rows)}</td>
                  <td>
                    <button
                      className="btn small danger"
                      onClick={async () => {
                        if (!confirm("Usunąć ten import i jego dane?")) return;
                        await api(`/api/projects/${projectId}/imports?import=${i.id}`, "DELETE");
                        loadImports();
                      }}
                    >
                      Usuń
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
