import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXCLUDE, matchesExclusion, parseVerdicts, pickDomain, type PageGroup } from "../src/lib/prospects-core.ts";

const pg = (over: Partial<PageGroup>): PageGroup => ({ page_id: "1", page_name: "X", ads: 1, first_start: null, last_start: null, eu_reach: 0, domains: [], sample_bodies: [], ...over });

test("wykluczenia: matura, fitness, spółka, AI – odpadają; zwykły kurs zostaje", () => {
  assert.equal(matchesExclusion(pg({ page_name: "Ścisłownia – matura z matmy" }), DEFAULT_EXCLUDE), "matur");
  assert.equal(matchesExclusion(pg({ sample_bodies: ["Trening na siłowni dla kobiet"] }), DEFAULT_EXCLUDE), "trening");
  assert.equal(matchesExclusion(pg({ domains: ["akademia-x.pl"], sample_bodies: ["Akademia X sp. z o.o. zaprasza"] }), DEFAULT_EXCLUDE), "sp. z o.o");
  assert.equal(matchesExclusion(pg({ sample_bodies: ["Zarabiaj z AI w biznesie"] }), DEFAULT_EXCLUDE), "ai");
  assert.equal(matchesExclusion(pg({ sample_bodies: ["Zarabiaj z AI."] }), DEFAULT_EXCLUDE), "ai");
  // krótkie frazy tylko jako całe słowo
  assert.equal(matchesExclusion(pg({ page_name: "Szkoła włoskiego Belle Parole" }), DEFAULT_EXCLUDE), null);
  assert.equal(matchesExclusion(pg({ page_name: "OSK Artur" }), DEFAULT_EXCLUDE), "osk");
  assert.equal(matchesExclusion(pg({ page_name: "Kursy Laika" }), DEFAULT_EXCLUDE), null);
  assert.equal(matchesExclusion(pg({ page_name: "Burgery u Burka" }), DEFAULT_EXCLUDE), null);
  assert.equal(matchesExclusion(pg({ page_name: "Rysuję SCADA", sample_bodies: ["Kurs programowania sterowników – dożywotni dostęp"] }), DEFAULT_EXCLUDE), null);
  // „obserwuj mnie na Instagramie” nie wyklucza – wyklucza nauka Instagrama
  assert.equal(matchesExclusion(pg({ sample_bodies: ["Więcej na moim Instagramie"] }), DEFAULT_EXCLUDE), null);
  assert.equal(matchesExclusion(pg({ sample_bodies: ["Kurs Instagrama od zera"] }), DEFAULT_EXCLUDE), "instagrama");
});

test("pickDomain pomija social i skracacze", () => {
  assert.equal(pickDomain(["linktr.ee", "www.instagram.com", "KURSY.PRZYKLAD.PL"]), "kursy.przyklad.pl");
  assert.equal(pickDomain(["facebook.com", "bit.ly"]), null);
  assert.equal(pickDomain([]), null);
});

test("parseVerdicts toleruje płotki i polskie znaki", () => {
  const v = parseVerdicts('Oto wynik:\n```json\n[{"page_id":"a","verdict":"pasuje","why":"kurs"},{"page_id":"b","verdict":"wątpliwe","why":"?"},{"page_id":"c","verdict":"NIE","why":"fitness"}]\n```');
  assert.equal(v.get("a")?.verdict, "pasuje");
  assert.equal(v.get("b")?.verdict, "watpliwe");
  assert.equal(v.get("c")?.verdict, "nie");
  assert.equal(parseVerdicts("nie wiem").size, 0);
});
