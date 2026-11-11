import assert from "node:assert";
import { test } from "node:test";

import { dueDailies, gameDay } from "../daily";

test("dia do jogo vira as 18:00 de Brasilia (21:00 UTC)", () => {
  const antes = Date.UTC(2026, 10, 8, 20, 59);
  const depois = Date.UTC(2026, 10, 8, 21, 0);
  assert.equal(gameDay(depois) - gameDay(antes), 1);
  assert.equal(gameDay(Date.UTC(2026, 10, 9, 20, 59)), gameDay(depois));
});

// 2026-11-08: com o bot ligado desde 17:34, nada rodou na virada das 18:00.
test("diarias pendentes: so as marcadas e nao feitas no dia", () => {
  const ids = ["act-tower", "act-guild", "act-firm"];
  const day = gameDay(Date.UTC(2026, 10, 8, 21, 30));
  const checked = (id: string) => id !== "act-guild";
  assert.deepEqual(dueDailies(ids, checked, { "act-tower": day - 1, "act-firm": day - 1 }, day), ["act-tower", "act-firm"]);
  assert.deepEqual(dueDailies(ids, checked, { "act-tower": day, "act-firm": day }, day), []);
  assert.deepEqual(dueDailies(ids, () => true, {}, day), ids);
});
