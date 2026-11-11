import assert from "node:assert";
import { test } from "node:test";

import { type ActChestSnapshot, nextActChestStep } from "../actchest";

// Estado real do Heroi em 2026-11-09 15:25: 60 pontos, so o bau de 30 pego.
function snap(p: Partial<ActChestSnapshot> = {}): ActChestSnapshot {
  return {
    inWorld: true, points: 60, week: 60,
    chests: [30, 60, 90, 120, 150].map((need, index) => ({ index, need, open: index === 0 })),
    weekNeeds: [500, 1000], ...p,
  };
}

function body(s: ActChestSnapshot | null, tried = new Set<string>()): string {
  const st = nextActChestStep(s, tried);
  return st.kind === "act" ? st.body : st.kind;
}

test("baus de atividade: pega so os liberados, um por vez, e conclui", () => {
  assert.equal(body(snap()), "callsi XDailyActivitiesDocument ReqFetchChest 1 1 0");
  // Recusado uma vez: nao repete na mesma passada.
  assert.equal(body(snap(), new Set(["chest1"])), "done");
  const two = snap({ points: 95, chests: snap().chests.map((c) => ({ ...c, open: false })) });
  assert.equal(body(two), "callsi XDailyActivitiesDocument ReqFetchChest 1 0 0");
  assert.equal(body(two, new Set(["chest0", "chest1"])), "callsi XDailyActivitiesDocument ReqFetchChest 1 2 0");
  const pegos = snap({ chests: snap().chests.map((c) => ({ ...c, open: c.need <= 60 })) });
  const st = nextActChestStep(pegos, new Set());
  assert.equal(st.kind, "done");
  assert.equal(st.kind === "done" && st.reason, "60 pontos hoje, proximo bau com 90, 60 na semana");
});

test("baus de atividade: sem resposta do servidor ou fora de mundo nao pega nada", () => {
  assert.equal(body(null), "fail");
  assert.equal(body(snap({ inWorld: false })), "fail");
  assert.equal(body(snap({ chests: [] })), "fail");
});

test("baus de atividade: semanal liberado so avisa", () => {
  const all = snap({ points: 150, week: 520, chests: snap().chests.map((c) => ({ ...c, open: true })) });
  const st = nextActChestStep(all, new Set());
  assert.equal(st.kind === "done" && st.reason, "150 pontos hoje, todos os baus do dia pegos, 520 na semana, bau semanal de 500 liberado (pegar no jogo; ainda nao automatizado)");
});
