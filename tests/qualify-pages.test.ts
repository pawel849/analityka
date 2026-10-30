// Testy parserów kwalifikacji stron – fetch podmieniony, bez sieci.
import { test } from "node:test";
import assert from "node:assert/strict";
import { qualifyDomain } from "../src/lib/qualify-pages.ts";
// Test parserów przez podmianę fetch.
const html = `<html><head><title>Kurs szycia – Anna Kowalska</title><meta name="description" content="Kurs online"></head><body>
<a href="/kontakt">Kontakt</a><a href="/style.css">x</a>
<p>Nazywam się Anna Kowalska. Kurs kosztuje 497 zł. Ponad 2 300 kursantek.</p>
<p>NIP: 5213456789 REGON: 12345678901 tel: 601 234 567, +48 22 123 45 67</p>
<a href="https://www.facebook.com/privacy/policy">fb</a><a href="https://facebook.com/annaszyje">fb</a>
<a href="https://instagram.com/anna.szyje">ig</a>
<p>Dostawca: Meta Platforms Ireland Limited. Sprzedawcą jest Anna Kowalska. Operator Google LLC.</p>
<a href="mailto:anna@szyje.pl">mail</a> newsletter
</body></html>`;
(globalThis as any).fetch = async (u: string) => new Response(u.includes("css") ? "body{}" : html, { status: 200, headers: { "content-type": u.includes("css") ? "text/css" : "text/html" } });
test("qualifyDomain parsery", async () => {
  const r = await qualifyDomain("szyje.pl");
  assert.equal(r.ok, true);
  assert.deepEqual(r.emails, ["anna@szyje.pl"]);
  assert.deepEqual(r.phones, ["+48 601 234 567", "+48 221 234 567"]);
  assert.deepEqual(r.facebook, ["facebook.com/annaszyje"]);
  assert.deepEqual(r.instagram, ["instagram.com/anna.szyje"]);
  assert.deepEqual(r.prices_pln, [497]);
  assert.deepEqual(r.company_markers, []);
  assert.ok(r.person_hints.includes("Anna Kowalska"));
  assert.equal(r.newsletter, true);
  assert.ok(!r.fetched.some((f) => f.endsWith(".css")));
  assert.ok(r.text_excerpt.includes("Nazywam się Anna Kowalska"));
});
