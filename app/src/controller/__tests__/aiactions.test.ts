import assert from "node:assert";
import { test } from "node:test";

import { actionsDoc, parseActions, safeAreas, SAFE_LEVEL_GAP, stripActions, validateAction } from "../aiactions";
import { MONSTER_AREAS } from "../areas";

test("tabela de areas: as do North Taklamakan e o Antelope que matou o Heroi", () => {
  assert.equal(MONSTER_AREAS.length, 192);
  const by = (id: number) => MONSTER_AREAS.find((a) => a.id === id);
  assert.deepEqual(by(64), { id: 64, scene: 100003, name: "Niya Sniper", level: 74, x: 1314, y: 94.75, z: 1200 });
  assert.equal(by(98)?.name, "Antelope");
  assert.equal(by(98)?.level, 83);
});

test("trava de nivel: Heroi 87 pode ate 79; o Antelope (83) e recusado", () => {
  assert.equal(SAFE_LEVEL_GAP, 8);
  const ok = validateAction({ acao: "trocar_ponto", area: 64 }, 87);
  assert.equal(ok.ok, true);
  assert.match(ok.ok ? ok.desc : "", /Niya Sniper \(74\)/);
  const bad = validateAction({ acao: "trocar_ponto", area: 98 }, 87);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.erro, /forte demais/);
  assert.equal(validateAction({ acao: "trocar_ponto", area: 9999 }, 87).ok, false);
  assert.equal(validateAction({ acao: "trocar_ponto", area: 64 }, 0).ok, false); // nivel desconhecido
  assert.ok(safeAreas(87).every((a) => a.level <= 79));
  assert.equal(validateAction({ acao: "protecao_hp", pct: 5 }, 87).ok, false);
  assert.equal(validateAction({ acao: "protecao_hp", pct: 50 }, 87).ok, true);
});

test("leitura das acoes: so blocos ```acao com acao da lista", () => {
  const text = [
    "O ponto atual rende pouco. Sugiro trocar:",
    "```acao",
    '{"acao": "trocar_ponto", "area": 64}',
    "```",
    "```acao",
    '{"acao": "comprar_silk"}',
    "```",
    "```acao",
    "isso nao e json",
    "```",
  ].join("\n");
  assert.deepEqual(parseActions(text), [{ acao: "trocar_ponto", area: 64 }]);
  assert.equal(stripActions(text), "O ponto atual rende pouco. Sugiro trocar:");
  assert.match(actionsDoc(87), /64: Niya Sniper \(74\)/);
  assert.doesNotMatch(actionsDoc(87), /Antelope/);
});
