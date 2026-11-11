import assert from "node:assert";
import { test } from "node:test";

import { isJunk, SELL_BODY, sellBatches, shouldSell } from "../sell";

test("venda: so a lista fixa; cartas, seals, pocoes e o amuleto q4 ficam", () => {
  assert.equal(isJunk(361002210), true); // Necklace of Battle (vendido ao vivo)
  assert.equal(isJunk(850010296), true); // Bowman cloth
  assert.equal(isJunk(361001231), false); // Amulet of Spirit q4
  assert.equal(isJunk(410000149), false); // Marksman Seal
  assert.equal(isJunk(6077), false); // carta Shaur
  assert.equal(isJunk(351002105), false); // pocao
  assert.equal(isJunk(undefined), false);
});

test("venda: so abaixo de 15 livres (leitura negativa nao conta) e em lotes de 20", () => {
  assert.equal(shouldSell(31), false);
  assert.equal(shouldSell(14), true);
  assert.equal(shouldSell(-97), false);
  assert.equal(shouldSell(undefined), false);
  const ids = Array.from({ length: 50 }, (_, i) => (i % 2 ? { id: 361000210, count: 1 } : { id: 6077, count: 3 }));
  const b = sellBatches(ids);
  assert.deepEqual(b.length, 25); // um por pedido
  assert.equal(b[0][0], 1);
  assert.equal(SELL_BODY, "callsn XSellDocument ReqSellOp 0");
});

test("uid de 64 bits sai do dump OBJV (o GETP so da 32 bits)", async () => {
  const { uidFromObjv, selectForSaleBody } = await import("../sell");
  const dump = "-- XItem\n  0x18 uid : System.UInt64  i=6738203 b=27 p=0x68488c110066d11b\n  0x24 itemID : System.Int32  i=361002210";
  assert.equal(uidFromObjv(dump), "7514409982916743451"); // o uid vendido ao vivo as 15:33
  assert.equal(uidFromObjv("sem uid"), undefined);
  assert.equal(selectForSaleBody("7514409982916743451"), "callx XSellDocument OnBagSelectSellItem 1 -- q:7514409982916743451");
});

test("venda: pula quantidade estranha (256/512 da copia local) e pet com mais de 1", async () => {
  const { plausibleCount, sellBatches } = await import("../sell");
  assert.equal(plausibleCount(361002210, 1), true);
  assert.equal(plausibleCount(361002210, 512), false); // visto ao vivo
  assert.equal(plausibleCount(850010296, 8), true); // Bowman cloth x8
  assert.equal(plausibleCount(850010296, 1000), false);
  assert.equal(plausibleCount(361002210, undefined), false);
  assert.deepEqual(sellBatches([{ id: 361002210, count: 512 }, { id: 361002210, count: 1 }]), [[1]]);
});

test("venda ampliada: drops pela descricao, evento e caravana; Firm, gift box e cartas ficam", async () => {
  const { isJunk, isMonsterDrop, plausibleCount } = await import("../sell");
  // Descricoes reais do jogo (2026-11-07).
  assert.equal(isMonsterDrop(410000149, "Defeat Niya Sniper (Normal) at Taklamakan will have a chance to receive"), true);
  assert.equal(isMonsterDrop(410000114, "Used to complete the Firm's daily task"), false); // Reeds
  assert.equal(isMonsterDrop(410000040, "Can be purchased at the Guild shop. Used to complete the Firm's daily task"), false);
  assert.equal(isMonsterDrop(6077, "Defeat ..."), false); // fora da faixa 4100xxxxx (carta)
  assert.equal(isJunk(5051), true); // Moon Crystal (evento)
  assert.equal(isJunk(351002303), true); // Caravan Recovery Kit
  assert.equal(isJunk(5064), false); // Mid-Autumn Gift Box: abrir
  assert.equal(isJunk(4904), false); // ticket de mochila
  assert.equal(plausibleCount(410000149, 999), true); // pilha cheia de Marksman Seal
  assert.equal(plausibleCount(410000149, 1000), false);
});

test("venda confere o item na hora: indice que mudou nao vende, lista so com o esperado", async () => {
  const { itemFromObjv, sameItem, readyToSell, soldByTotal, itemTotalBody } = await import("../sell");
  // Dump real do indice 145 (2026-11-07 21:31) e o mesmo indice depois da venda.
  const antes = "  0x24 itemID : System.Int32  i=410000098 b=251 p=0x1\n  0x28 itemCount : System.Int32  i=16 b=16 p=0x10";
  const depois = "  0x24 itemID : System.Int32  i=410000042 b=1 p=0x1\n  0x28 itemCount : System.Int32  i=423 b=1 p=0x1";
  assert.deepEqual(itemFromObjv(antes), { id: 410000098, count: 16 });
  assert.equal(sameItem(410000098, itemFromObjv(antes)), true);
  assert.equal(sameItem(410000098, itemFromObjv(depois)), false); // virou material do Firm
  assert.equal(sameItem(361002210, { id: 361002210, count: 512 }), false); // contagem estranha
  assert.equal(readyToSell(410000098, 1, 410000098), true);
  assert.equal(readyToSell(410000098, 0, undefined), false); // nada marcado: nao manda o pedido
  assert.equal(readyToSell(410000098, 1, 410000042), false); // outro item na lista
  assert.equal(readyToSell(410000098, 2, 410000098), false); // sobra de antes
  assert.equal(soldByTotal(16, 0), true);
  assert.equal(soldByTotal(16, 16), false);
  assert.equal(soldByTotal(undefined, 0), false);
  assert.equal(itemTotalBody(410000098), "XBagDocument GetItemCount:410000098,0");
});

test("venda: pilhas antes dos avulsos (3 avulsos recusados nao travam as pilhas)", async () => {
  const { sellOrder } = await import("../sell");
  const bag = [{ count: 1 }, { count: 999 }, { count: 1 }, { count: 16 }, { count: 1 }];
  assert.deepEqual(sellOrder(bag, [0, 1, 2, 3, 4]), [3, 1, 4, 2, 0]);
  assert.deepEqual(sellOrder(bag, []), []);
});
