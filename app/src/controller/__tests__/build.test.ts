import assert from "node:assert";
import { test } from "node:test";

import { buildStale, BUILD_TTL_MS, parseAttrDump } from "../build";

test("atributos: decodifica o double dos bits do ATTR e so os campos que interessam", () => {
  // Linhas reais do Heroi (2026-11-07 17:10, com o VIP ativo).
  const dump = [
    "== GetAttr(i) ==",
    "  GetAttr(3) = i:-65772059 l:4646622755521062373 f:-0.00",
    "  GetAttr(19) = i:-954842291 l:4657371923902513997 f:-38467.30",
    "  GetAttr(2) = i:0 l:4607182418800017408 f:0.00",
  ].join("\n");
  const a = parseAttrDump(dump);
  assert.equal(a.INT, 449.9);
  assert.equal(a["ataque fisico min"], 2343.5);
  assert.equal(Object.keys(a).length, 2); // o id 2 nao interessa
});

test("retrato: cache de 10 min ou ate mudar o nivel", () => {
  assert.equal(buildStale(0, undefined, 87, 1000), true);
  assert.equal(buildStale(1000, 87, 87, 1000 + BUILD_TTL_MS - 1), false);
  assert.equal(buildStale(1000, 87, 88, 2000), true);
  assert.equal(buildStale(1000, 87, 87, 1000 + BUILD_TTL_MS), true);
});

test("tipo da build pelos atributos (Heroi: INT 450, STR 179)", async () => {
  const { buildType } = await import("../build");
  assert.equal(buildType({ STR: 179, INT: 450 }), "INT (dano magico)");
  assert.equal(buildType({ STR: 500, INT: 120 }), "STR (dano fisico)");
  assert.equal(buildType({ STR: 300, INT: 300 }), "hibrido");
  assert.equal(buildType({}), undefined);
});

test("grau e raridade do equipamento: so o byte de baixo (o GETP le int32)", async () => {
  const { byte } = await import("../build");
  assert.equal(byte(9), 9); // EquipRank da True Flame Spear
  assert.equal(byte(150995203), 3); // SubType lido com os vizinhos
  assert.equal(byte(undefined), undefined);
});

test("atributos da peca: SeqListRef<double> lido em palavras de 32 bits", async () => {
  const { seqHeader, u16Of, doubleOf, attrRows, basicAttrNames } = await import("../build");
  // Cabecalho real da True Flame Spear (Attributes): +8 = 0x0a, +12 = 0x785c.
  assert.deepEqual(seqHeader(0x0a, 0x785c), { n: 10, off: 30812 });
  assert.deepEqual(seqHeader(0x100, 0), { n: 0, off: 0 }); // SmeltNeedItem vazio
  assert.equal(seqHeader(undefined, 1), undefined);
  assert.equal(u16Of(0x22de22dc, 0), 0x22dc);
  assert.equal(u16Of(0x22de22dc, 1), 0x22de);
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, 1192, true);
  assert.equal(doubleOf(b.getInt32(0, true), b.getInt32(4, true)), 1192);
  const names = basicAttrNames({ XAttr_PhysicalAtkMinIncPer_Basic: 21, XAttr_Foo_Total: 99, XAttr_Foo_Basic: 99 });
  assert.deepEqual(attrRows([[19, 1001], [25, 1923], [21, 169.8], [99, 1.234], [200, 5]], names), {
    "ataque fisico min": 1001, "ataque magico min": 1923, "reforco ataque fisico min": 169.8, Foo: 1.23, "atributo 200": 5,
  });
  assert.equal(attrRows([], names), undefined);
});
