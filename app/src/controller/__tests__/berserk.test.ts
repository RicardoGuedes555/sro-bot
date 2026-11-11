import assert from "node:assert";
import { test } from "node:test";

import { BERSERK_CLICK, BERSERK_VISIBLE, shouldBerserk } from "../berserk";

test("Berserk: so em combate, vivo, em mundo e fora de viagem", () => {
  assert.equal(shouldBerserk({ inWorld: true, dead: false, inCombat: true }, false), true);
  assert.equal(shouldBerserk({ inWorld: true, dead: false, inCombat: false }, false), false); // sem monstro: desperdica
  assert.equal(shouldBerserk({ inWorld: true, dead: false, inCombat: true }, true), false); // viajando pro ponto
  assert.equal(shouldBerserk({ inWorld: true, dead: true, inCombat: true }, false), false);
  assert.equal(shouldBerserk(null, false), false);
});

test("Berserk: le o botao e chama o metodo do toque (sem tap)", () => {
  assert.equal(BERSERK_VISIBLE, "BattleMain m_uiBehaviour m_BerserkerBtn IsVisible");
  assert.match(BERSERK_CLICK, /^callx BattleMain OnBerserkerButtonClick 1 -- o:BattleMain\|m_uiBehaviour\|m_BerserkerBtn$/);
});

test("Devil: clica pelo metodo uma vez por minuto (recarga de ~30 min nao e lida)", async () => {
  const { DEVIL_CLICK, DEVIL_EVERY_MS } = await import("../berserk");
  assert.equal(DEVIL_CLICK, "callx BattleMain OnNasrunButtonClick 1 -- o:BattleMain|m_uiBehaviour|m_NasrunBtn");
  assert.equal(DEVIL_EVERY_MS, 60_000);
});
