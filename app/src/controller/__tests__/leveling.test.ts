import assert from "node:assert";
import { test } from "node:test";

import {
  LEVELING_ACCUM,
  LEVELING_END,
  LEVELING_OPEN_COOLDOWN_MS,
  levelingPhase,
  levelingText,
  readLeveling,
  shouldOpenLeveling,
} from "../leveling";

// Lido ao vivo em 2026-11-08 21:35: aberto ate 22:13:43 (1794186823), guardado 0.
test("training time: le o guardado e o aberto restante como na janela Leveling", async () => {
  const now = (1794186823 - 38 * 60) * 1000;
  const q = async (_t: string, body: string) =>
    body === LEVELING_ACCUM ? { ok: true, int: 0 } : body === LEVELING_END ? { ok: true, int: 1794186823 } : { ok: false };
  const l = await readLeveling(q, now);
  assert.deepEqual(l, { accumMin: 0, openLeftS: 38 * 60 });
  assert.equal(levelingText(l!), "training time x10 aberto 0h38, guardado 0h00");
  assert.equal(levelingPhase(l!), "open");
  // Fechado ha tempo: restante 0, nunca negativo.
  assert.equal((await readLeveling(q, (1794186823 + 600) * 1000))?.openLeftS, 0);
  assert.equal(await readLeveling(async () => ({ ok: false }), now), undefined);
});

test("training time: abre so cacando, com tempo guardado e o aberto acabando", () => {
  const now = 10 * 60 * 1000;
  const fechando = { accumMin: 240, openLeftS: 30 };
  assert.equal(shouldOpenLeveling(fechando, true, 0, now), true);
  assert.equal(shouldOpenLeveling(fechando, false, 0, now), false); // viajando ou parando
  assert.equal(shouldOpenLeveling({ accumMin: 0, openLeftS: 0 }, true, 0, now), false); // nada guardado
  assert.equal(shouldOpenLeveling({ accumMin: 240, openLeftS: 1800 }, true, 0, now), false); // ainda aberto
  assert.equal(shouldOpenLeveling(fechando, true, now - LEVELING_OPEN_COOLDOWN_MS + 1, now), false); // acabou de pedir
  assert.equal(levelingText({ accumMin: 240, openLeftS: 0 }), "training time x10 fechado, guardado 4h00");
  assert.equal(levelingPhase({ accumMin: 0, openLeftS: 0 }), "empty");
});
