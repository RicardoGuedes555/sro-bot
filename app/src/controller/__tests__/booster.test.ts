import assert from "node:assert";
import { test } from "node:test";

import { boosterDue, boosterUntil, BOOSTERS, pickBooster, useItemBody } from "../booster";

test("booster: escolhe 200% 1 h, depois 2 h, depois 100%; nada sem estoque", () => {
  // Estoque do Heroi em 2026-11-07: 28 / 5 / 2.
  assert.equal(pickBooster({ 850040006: 28, 850040007: 5, 850040004: 2 })?.id, 850040006);
  assert.equal(pickBooster({ 850040006: 0, 850040007: 5 })?.id, 850040007);
  assert.equal(pickBooster({ 850040004: 1 })?.id, 850040004);
  assert.equal(pickBooster({}), undefined);
});

test("booster: vale a duracao mais uma margem; o comando usa OpType 0 e quantidade 1", () => {
  const until = boosterUntil(BOOSTERS[0], 0);
  assert.equal(until, 60 * 60 * 1000 + 30 * 1000);
  assert.equal(boosterDue(until, until - 1), false);
  assert.equal(boosterDue(until, until), true);
  assert.equal(useItemBody(36), "callx XBagDocument UseItem 3 -- o:XBagDocument|ItemBag|Items|get_Item:36 u:0 u:1");
});

test("buffs: dano usa o de dano e absorcao antes do so de dano; validade por grupo e formato antigo", async () => {
  const { BUFF_GROUPS, pickBuff, untilOf } = await import("../booster");
  const dano = BUFF_GROUPS.find((g) => g.key === "dano")!;
  // Estoque do Heroi em 2026-11-07: 24 / 11 / 7 (o so de absorcao fica guardado).
  assert.equal(pickBuff(dano.items, { 850040001: 24, 850040002: 11, 850040003: 7 })?.id, 850040001);
  assert.equal(pickBuff(dano.items, { 850040001: 0, 850040002: 11, 850040003: 7 })?.id, 850040002);
  assert.equal(pickBuff(dano.items, { 850040003: 7 }), undefined);
  assert.equal(BUFF_GROUPS.find((g) => g.key === "vip")!.items[0].minutes, 60);
  // Arquivo da 0.101.0 ({until}) vale pro Exp Booster.
  assert.equal(untilOf({ until: 5 }, "exp"), 5);
  assert.equal(untilOf({ until: 5 }, "dano"), 0);
  assert.equal(untilOf({ exp: { until: 7 }, dano: { until: 9 } }, "dano"), 9);
  assert.equal(untilOf(null, "vip"), 0);
});
