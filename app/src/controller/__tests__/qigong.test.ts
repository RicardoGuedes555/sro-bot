import assert from "node:assert";
import { test } from "node:test";

import { qigongCandidates, qigongRole, type QigongSnapshot, requestBody } from "../qigong";

// Estado real em 2026-11-09 17:16: Heroi Lv.87, 2/2; online com o botao Inherit
// (isInherit) MembroA 100 e MembroB 31; sem ele Kurapikaa e Cobraa 83, BalacaObama 92.
function snap(p: Partial<QigongSnapshot> = {}): QigongSnapshot {
  return {
    inWorld: true, inGuild: true, level: 87, gap: 10, teacherLeft: 2, studentLeft: 2, inheriting: false,
    online: [
      { index: 0, name: "MembroA", level: 100, canInherit: true },
      { index: 1, name: "MembroB", level: 31, canInherit: true },
      { index: 2, name: "Kurapikaa", level: 83, canInherit: false },
      { index: 3, name: "Cobraa", level: 83, canInherit: false },
      { index: 4, name: "BalacaObama", level: 92, canInherit: false },
    ],
    ...p,
  };
}

test("qigong: papel pela diferenca de nivel e pelas vezes que sobram", () => {
  const s = snap();
  assert.equal(qigongRole(s, 100), "student");
  assert.equal(qigongRole(s, 77), "teacher");
  assert.equal(qigongRole(s, 78), undefined); // 9 niveis
  assert.equal(qigongRole(s, 92), undefined);
  assert.equal(qigongRole({ ...s, studentLeft: 0 }, 100), undefined);
  assert.equal(qigongRole({ ...s, teacherLeft: 0 }, 31), undefined);
});

test("qigong: candidatos so com o botao Inherit e diferenca de 10; aluno primeiro, nivel mais alto", () => {
  assert.deepEqual(qigongCandidates(snap(), new Set()).map((m) => m.name), ["MembroA", "MembroB"]);
  const more = snap({ online: snap().online.concat({ index: 5, name: "Alto", level: 98, canInherit: true }, { index: 6, name: "Sem", level: 99, canInherit: false }) });
  assert.deepEqual(qigongCandidates(more, new Set()).map((m) => m.name), ["MembroA", "Alto", "MembroB"]);
  assert.deepEqual(qigongCandidates(more, new Set(["MembroA"])).map((m) => m.name), ["Alto", "MembroB"]);
  assert.deepEqual(qigongCandidates(snap({ studentLeft: 0 }), new Set()).map((m) => m.name), ["MembroB"]);
  assert.equal(requestBody("1125907153127379"), "callx XGuildInheritDocument SendReqInherit 1 -- q:1125907153127379");
});

test("qigong: parado no Guild Hall sem Qigong nem convite sai depois de 45 s", async () => {
  const { hallIdleStep, QIGONG_HALL_IDLE_MS } = await import("../qigong");
  // Fora do Guild Hall, ou com Qigong/convite: zera.
  assert.deepEqual(hallIdleStep(false, false, 5000, 9000), { idleSince: 0, leave: false });
  assert.deepEqual(hallIdleStep(true, true, 5000, 9000), { idleSince: 0, leave: false });
  // Caso de 2026-11-09 20:23: char la, Qigong acabou; conta e sai.
  let s = hallIdleStep(true, false, 0, 1000);
  assert.deepEqual(s, { idleSince: 1000, leave: false });
  s = hallIdleStep(true, false, s.idleSince, 1000 + QIGONG_HALL_IDLE_MS - 1);
  assert.equal(s.leave, false);
  assert.equal(hallIdleStep(true, false, s.idleSince, 1000 + QIGONG_HALL_IDLE_MS).leave, true);
});

test("qigong: 2 pedidos sem aceite no dia param os pedidos a ele ate a virada (noite de 2026-11-09)", async () => {
  const { qigongAsked, qigongSkipNames, QIGONG_ASK_AGAIN_MS } = await import("../qigong");
  const { gameDay } = await import("../daily");
  // 2026-11-09 21:18 em Brasilia (00:18 UTC de 11-10): dia do jogo comecou as 18:00.
  const t0 = Date.UTC(2026, 10, 10, 0, 18);
  const asks = new Map();
  asks.set("MembroA", qigongAsked(undefined, t0, true));
  assert.equal(asks.get("MembroA").misses, 1);
  // Antes dos 30 min: pula; depois: pede de novo.
  assert.ok(qigongSkipNames(asks, t0 + QIGONG_ASK_AGAIN_MS - 1).has("MembroA"));
  assert.ok(!qigongSkipNames(asks, t0 + QIGONG_ASK_AGAIN_MS).has("MembroA"));
  // Segundo sem aceite: so depois da virada (18:00 em Brasilia, 21:00 UTC).
  const t1 = t0 + QIGONG_ASK_AGAIN_MS;
  asks.set("MembroA", qigongAsked(asks.get("MembroA"), t1, true));
  assert.equal(asks.get("MembroA").misses, 2);
  const beforeTurn = Date.UTC(2026, 10, 10, 20, 59);
  const afterTurn = Date.UTC(2026, 10, 10, 21, 0);
  assert.equal(gameDay(beforeTurn), gameDay(t1));
  assert.ok(qigongSkipNames(asks, beforeTurn).has("MembroA"));
  assert.ok(!qigongSkipNames(asks, afterTurn).has("MembroA"));
  // No dia novo a conta recomeca.
  assert.equal(qigongAsked(asks.get("MembroA"), afterTurn, true).misses, 1);
  // Aceite nao conta como falta.
  assert.equal(qigongAsked(undefined, t0, false).misses, 0);
});

test("qigong: pedidos salvos voltam ao reabrir o app, so os de hoje e de ontem", async () => {
  const { asksFromJson, asksToJson, qigongAsked, qigongSkipNames } = await import("../qigong");
  const t = Date.UTC(2026, 10, 10, 13, 20); // 10:20 em Brasilia
  const asks = new Map();
  asks.set("MembroA", qigongAsked(qigongAsked(undefined, t - 3600000, true), t, true));
  const back = asksFromJson(JSON.parse(JSON.stringify(asksToJson(asks))), t + 60000);
  assert.equal(back.get("MembroA")?.misses, 2);
  assert.ok(qigongSkipNames(back, t + 60000).has("MembroA"));
  // Velho (3 dias) ou lixo: ignorado.
  const old = asksFromJson({ Velho: { at: t - 3 * 86400000, day: back.get("MembroA")!.day - 3, misses: 2 }, Lixo: { at: "x" } }, t);
  assert.equal(old.size, 0);
  assert.equal(asksFromJson(null, t).size, 0);
});
