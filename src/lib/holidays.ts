// Polskie święta ustawowo wolne od pracy (+ Wigilia – wolna od 2025 r.).

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Data Wielkanocy (algorytm Meeusa/Jonesa/Butchera, kalendarz gregoriański). */
export function easter(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

export function holidays(y: number): Map<string, string> {
  const out = new Map<string, string>([
    [iso(y, 1, 1), "Nowy Rok"],
    [iso(y, 1, 6), "Trzech Króli"],
    [iso(y, 5, 1), "Święto Pracy"],
    [iso(y, 5, 3), "Święto Konstytucji 3 Maja"],
    [iso(y, 8, 15), "Wniebowzięcie NMP"],
    [iso(y, 11, 1), "Wszystkich Świętych"],
    [iso(y, 11, 11), "Święto Niepodległości"],
    [iso(y, 12, 25), "Boże Narodzenie"],
    [iso(y, 12, 26), "Drugi dzień świąt"],
  ]);
  if (y >= 2025) out.set(iso(y, 12, 24), "Wigilia");
  const e = easter(y);
  const base = Date.UTC(y, e.m - 1, e.d);
  const add = (n: number, name: string) => out.set(new Date(base + n * 86400_000).toISOString().slice(0, 10), name);
  add(0, "Wielkanoc");
  add(1, "Poniedziałek Wielkanocny");
  add(49, "Zielone Świątki");
  add(60, "Boże Ciało");
  return out;
}
