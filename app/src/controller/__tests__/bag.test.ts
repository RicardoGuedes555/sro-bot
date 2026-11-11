import assert from "node:assert";
import { test } from "node:test";

import { bagLevel, bagStep, bagText, type BagWatch } from "../bag";

test("mochila: niveis pelos espacos livres; leitura negativa nao conta", () => {
  assert.equal(bagLevel(39), "ok");
  assert.equal(bagLevel(9), "low");
  assert.equal(bagLevel(1), "full"); // o caso do Heroi as 08:25
  assert.equal(bagLevel(-97), undefined);
  assert.equal(bagLevel(undefined), undefined);
  assert.match(bagText("full", 1), /AutoBuy nao repoe/);
});

test("mochila: so muda com duas leituras iguais e so notifica quando piora", () => {
  let w: BagWatch = {};
  const step = (lv: ReturnType<typeof bagLevel>) => {
    const r = bagStep(w, lv);
    w = r.watch;
    return r;
  };
  assert.equal(step("ok").changed, false); // primeira leitura: espera confirmar
  assert.deepEqual(step("ok"), { watch: { shown: "ok", pending: undefined }, notify: false, changed: true });
  assert.equal(step("full").notify, false); // uma leitura so (podia ser o -97)
  assert.equal(step(undefined).changed, false);
  assert.equal(step("full").notify, false); // a leitura ruim no meio zerou a confirmacao
  const r = step("full");
  assert.equal(r.notify, true);
  assert.equal(w.shown, "full");
  step("ok");
  const back = step("ok");
  assert.equal(back.changed, true);
  assert.equal(back.notify, false); // melhorou: muda o selo, sem notificacao
});
