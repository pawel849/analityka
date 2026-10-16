import { test } from "node:test";
import assert from "node:assert/strict";
import { easter, holidays } from "../src/lib/holidays.ts";

test("Wielkanoc i święta ruchome", () => {
  assert.deepEqual(easter(2026), { m: 4, d: 5 });
  assert.deepEqual(easter(2025), { m: 4, d: 20 });
  const h = holidays(2026);
  assert.equal(h.get("2026-04-06"), "Poniedziałek Wielkanocny");
  assert.equal(h.get("2026-06-04"), "Boże Ciało");
  assert.equal(h.get("2026-11-11"), "Święto Niepodległości");
  assert.equal(h.get("2026-12-24"), "Wigilia");
});
