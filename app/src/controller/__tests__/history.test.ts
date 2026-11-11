import assert from "node:assert";
import { test } from "node:test";

import { areaStats, eventFromLog, expGain, nearestArea, type Sample } from "../history";

const s = (p: Partial<Sample>): Sample => ({ ts: 0, level: 87, exp: 0, maxExp: 2258820361, training: true, dead: false, ...p });

test("area da amostra: a area de monstro mais perto na mesma cena", () => {
  // Pontos reais do Heroi no North Taklamakan.
  assert.equal(nearestArea(100003, 1328, 1172), "Niya Hunter (76)"); // Sniper 74 e Hunter 76 dividem o ponto: fica a mais forte
  assert.equal(nearestArea(100003, 2148, 1430), "Niya Guard (73)");
  assert.equal(nearestArea(100001, 1328, 1172), "Tiger (14)"); // mesma coordenada em Jangan: area de la
  assert.equal(nearestArea(100003, 9999, 9999), undefined); // longe de tudo
  assert.equal(nearestArea(undefined, 1, 1), undefined);
});

test("ganho de EXP: mesmo nivel, level-up, e morte nao conta", () => {
  assert.equal(expGain(s({ exp: 100 }), s({ exp: 250 })), 150);
  assert.equal(expGain(s({ exp: 2258820000 }), s({ level: 88, exp: 500 })), 361 + 500);
  assert.equal(expGain(s({ exp: 41000 }), s({ exp: 792 })), 0); // perdeu EXP morrendo
});

test("resumo por area: EXP/h, HP minimo e mortes; buraco grande e fora do treino nao contam", () => {
  const m = 60000;
  const A = "Niya Hunter (76)";
  const B = "Niya Guard (73)";
  const samples = [
    s({ ts: 0, exp: 0, area: A, hpPct: 100 }),
    s({ ts: 1 * m, exp: 90000, area: A, hpPct: 93 }),
    s({ ts: 2 * m, exp: 180000, area: A, hpPct: 98 }),
    s({ ts: 20 * m, exp: 999999, area: A }), // buraco de 18 min (jogo fechado): nao soma
    s({ ts: 21 * m, exp: 1000000, area: B, training: false }),
    s({ ts: 22 * m, exp: 1003000, area: B }),
    s({ ts: 23 * m, exp: 1007000, area: B }),
    s({ ts: 24 * m, exp: 0, area: B, dead: true }),
  ];
  const r = areaStats(samples);
  assert.equal(r[0].area, A);
  assert.equal(r[0].minutes, 2);
  assert.equal(r[0].expPerHour, 5400000);
  assert.equal(r[0].minHpPct, 93);
  const b = r.find((x) => x.area === B)!;
  assert.equal(b.minutes, 1); // so 22->23 (21 fora do treino, 24 morto)
  assert.equal(b.expPerHour, 240000);
  assert.equal(b.deaths, 1);
});

test("eventos do log", () => {
  assert.deepEqual(eventFromLog("[22:40:48] [continental] pegar o bau verde (espaco 2)"),
    { kind: "bau", text: "[continental] pegar o bau verde (espaco 2)" });
  assert.equal(eventFromLog("[treino] morreu (1/1).")?.kind, "morte");
  assert.equal(eventFromLog("conexao com o servidor caiu (Connection failed); reiniciando o jogo...")?.kind, "queda");
  assert.equal(eventFromLog("jogo congelado; reiniciando o jogo...")?.kind, "queda");
  assert.equal(eventFromLog("[treino] EXP parado ha 6 min: desligar e religar a caca")?.kind, "preso");
  assert.equal(eventFromLog("[treino] EXP parado ha 10 min no ponto mesmo religando a caca: indo pro ponto 2")?.kind, "preso");
  assert.equal(eventFromLog("[treino] mochila com 1 espaco(s) livre(s): o AutoBuy nao consegue repor. Libere a mochila.")?.kind, "suprimentos");
  assert.equal(eventFromLog("[treino] pergaminho de dano ativado: 20% damage increase/absorption scroll (sobram 23).")?.kind, "buff");
  assert.equal(eventFromLog("[treino] VIP STR/INT: VIP Strength and Intellect Increase Scroll nao foi usado (o jogo recusou); tento de novo em 10 min.")?.kind, "buff");
  assert.equal(eventFromLog("[treino] andando ate o ponto 1"), undefined);
});

test("EXP por atividade: ganho, level-up, perda e aviso do Treino junto", async () => {
  const { activityExpLine } = await import("../history");
  const p = (level: number, exp: number) => ({ level, exp, maxExp: 1000 });
  assert.equal(activityExpLine("Demon Locking Tower", p(87, 100), p(87, 600), 4, false), "[exp] Demon Locking Tower: +500 EXP em 4 min.");
  assert.match(activityExpLine("Firm", p(87, 900), p(88, 50), 2, true), /\+150 EXP em 2 min \(com o Treino cacando junto\)/);
  assert.match(activityExpLine("Continental", p(87, 600), p(87, 100), 3, false), /perdeu 500 EXP/);
  assert.equal(eventFromLog("[exp] Firm: +150 EXP em 2 min.")?.kind, "exp atividade");
  assert.equal(eventFromLog("[treino] maestrias: grupo 2 no 88, grupo 5 no 88.")?.kind, "skills");
  assert.equal(eventFromLog("[treino] skills: 8 nivel(is) pedido(s) no level-up.")?.kind, "skills");
});
