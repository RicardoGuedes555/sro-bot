import assert from "node:assert";
import { test } from "node:test";

import {
  DEFAULT_TOWER_CONFIG,
  type DemonTowerConfig,
  ENTER_TIMEOUT_MS,
  emptyTowerSnapshot,
  f32FromBits,
  leftOf,
  sweepsLeftOf,
  multipleLabel,
  newTowerProgress,
  nextTowerStep,
  type TowerProgress,
  type TowerSnapshot,
  TowerDriver,
  trackTower,
} from "../tower";

// Overworld com o dialogo aberto e nada pendente.
function snap(p: Partial<TowerSnapshot>): TowerSnapshot {
  return {
    ...emptyTowerSnapshot(), inWorld: true, sceneType: 76, sceneId: 100001, dialog: true, dataReady: true,
    maxLevel: 5, topFloor: 300, sweepsLeft: 0, ...p,
  };
}

function id(s: TowerSnapshot | null, cfg: DemonTowerConfig = DEFAULT_TOWER_CONFIG, p: TowerProgress = newTowerProgress()): string {
  const st = nextTowerStep(s, cfg, p);
  return st.kind === "act" ? st.id : st.kind;
}

test("helpers: bits do Single, label do multiple e N/M", () => {
  assert.equal(f32FromBits(1065353216), 1);
  assert.equal(Math.round(f32FromBits(1067869798) * 100) / 100, 1.3); // visto ao vivo: 1.3x
  assert.equal(multipleLabel(1.3), "1.3x");
  assert.equal(leftOf("4/5"), 4);
  assert.equal(sweepsLeftOf("Sweep[6acb3b] 0/1"), 0);
  assert.equal(sweepsLeftOf("Sweep[6acb3b] 1/1"), 1);
  assert.equal(sweepsLeftOf("Sweep (1/1)"), -1); // label velho visto ao vivo depois do Return
  assert.equal(leftOf(""), -1);
});

test("na torre: liga o auto-hunt se desligado, senao espera", () => {
  const tower = { sceneType: 16, sceneId: 102007, dialog: false };
  assert.equal(id(snap({ ...tower, autoPlay: false })), "autofight");
  const st = nextTowerStep(snap({ ...tower, autoPlay: true }), DEFAULT_TOWER_CONFIG, newTowerProgress());
  assert.deepEqual(st, { kind: "wait", reason: "subindo, andar 7" });
  assert.equal(id(snap({ ...tower, inWorld: false })), "wait"); // loading do andar
});

test("o que fica por cima sai primeiro: sono, resumo, dialogo fechado", () => {
  assert.equal(id(snap({ sleeping: true, summary: true, dialog: false })), "wake");
  assert.equal(id(snap({ summary: true, dialog: false })), "summary");
  assert.equal(id(snap({ dialog: false })), "open");
  assert.equal(id(null), "wait");
  assert.equal(id(snap({ inWorld: false })), "wait");
});

test("resultado do sweep: rerola ate o ratio, espera a animacao e pega", () => {
  const res = { sweepResult: true, multiple: 1.0, multipleText: "1.0x", freeRefreshes: 5 };
  assert.equal(id(snap(res)), "refresh");
  assert.equal(id(snap({ ...res, multiple: 1.2, multipleText: "1.4x" })), "wait"); // label ainda animando
  assert.equal(id(snap({ ...res, multiple: 1.3, multipleText: "1.3x" })), "getreward"); // >= 1.3
  assert.equal(id(snap({ ...res, freeRefreshes: 0 })), "getreward"); // sem refresh gratis, nao paga
  assert.equal(id(snap(res), { ...DEFAULT_TOWER_CONFIG, refreshRewardRatio: 0 }), "getreward");
});

test("First Bonus: abre, Receive all, fecha", () => {
  assert.equal(id(snap({ firstPassRed: true })), "showfirst");
  assert.equal(id(snap({ firstPassRed: true, firstPassPanel: true })), "takeall");
  assert.equal(id(snap({ firstPassPanel: true })), "closefirst");
  assert.equal(id(snap({ sweepFrame: true })), "closesweep");
});

test("subida: uma entrada por ciclo, depois sweepa e fecha", () => {
  const cfg = DEFAULT_TOWER_CONFIG;
  assert.equal(id(snap({ sweepsLeft: 1 }), cfg), "enter");
  const p = { ...newTowerProgress(), entries: 1 };
  assert.equal(id(snap({ sweepsLeft: 1 }), cfg, p), "sweep");
  assert.equal(id(snap({ sweepsLeft: 1, inSweeping: true }), cfg, p), "close");
  assert.equal(id(snap({ sweepsLeft: 0 }), { ...cfg, sweep: false }, p), "close"); // ja subiu: nao entra de novo
  // Sweep sem "lutar 1x": nao entra se ja passou o Floor 1.
  const noFight = { ...cfg, fightOnceBeforeSweeping: false };
  assert.equal(id(snap({ sweepsLeft: 1 }), noFight), "sweep");
  // Nunca passou o Floor 1: entra mesmo com sweep (o jogo exige).
  assert.equal(id(snap({ maxLevel: 0, sweepsLeft: 1 }), noFight), "enter");
  // No topo nao entra.
  assert.equal(id(snap({ maxLevel: 300 }), { ...cfg, sweep: false }), "close");
});

const lose = (floor: number, p: Partial<TowerSnapshot> = {}) =>
  snap({ sceneType: 16, sceneId: 102000 + floor, dialog: false, autoPlay: true, stageFailed: true, ...p });

test("sweep: um por ciclo; contador velho reabre o dialogo ate 3x", () => {
  const cfg = DEFAULT_TOWER_CONFIG;
  const climbed = { ...newTowerProgress(), entries: 1 };
  assert.equal(id(snap({ sweepsLeft: 1 }), cfg, { ...climbed, sweepSent: true }), "close");
  assert.equal(id(snap({ sweepsLeft: -1 }), cfg, climbed), "reload");
  assert.equal(id(snap({ sweepsLeft: -1 }), cfg, { ...climbed, reloads: 3 }), "close");
  assert.equal(id(snap({ sweepsLeft: -1 }), { ...cfg, sweep: false }, climbed), "close");
});

test("sem dados da torre: espera 6 s, reabre ate 3x e desiste fechando", () => {
  const noData = snap({ dataReady: false, maxLevel: 0, sweepsLeft: -1 });
  const p = newTowerProgress();
  assert.equal(id(noData, DEFAULT_TOWER_CONFIG, { ...p, dialogMs: 1000 }), "wait"); // nao entra no "andar 1"
  assert.equal(id(noData, DEFAULT_TOWER_CONFIG, { ...p, dialogMs: 6000 }), "reload");
  assert.equal(id(noData, DEFAULT_TOWER_CONFIG, { ...p, dialogMs: 6000, reloads: 3 }), "close");
});

test("trackTower: conta ha quanto tempo o dialogo esta na tela", () => {
  let p = trackTower(newTowerProgress(), snap({}), 1000);
  p = trackTower(p, snap({}), 7500);
  assert.equal(p.dialogMs, 6500);
  p = trackTower(p, snap({ dialog: false }), 8000);
  assert.equal(p.dialogMs, 0);
});

test("LOSE: Challenge again ate 2x no mesmo andar e Return na 3a queda", () => {
  const cfg = { ...DEFAULT_TOWER_CONFIG, sweep: false };
  const at = (failures: number) => ({ ...newTowerProgress(), entries: 1, inside: true, floor: 14, failures, loseSeen: true });
  assert.equal(id(lose(14), cfg, at(1)), "retry");
  assert.equal(id(lose(14), cfg, at(2)), "retry");
  assert.equal(id(lose(14), cfg, at(3)), "return");
  assert.equal(id(lose(14), { ...cfg, refreshOnFailure: false }, at(1)), "return");
  // Sono e resumo por cima do LOSE saem antes.
  assert.equal(id(lose(14, { sleeping: true }), cfg, at(1)), "wake");
  assert.equal(id(lose(14, { summary: true }), cfg, at(1)), "summary");
});

test("LOSE no modo sweep (lutar 1x): volta sem refazer", () => {
  const p = { ...newTowerProgress(), entries: 1, inside: true, floor: 14, failures: 1, loseSeen: true, levelAtEntry: 13 };
  assert.equal(id(lose(14), DEFAULT_TOWER_CONFIG, p), "return");
  // Primeira subida (Floor 1 nao passado): refaz mesmo com sweep ligado.
  assert.equal(id(lose(1), DEFAULT_TOWER_CONFIG, { ...p, floor: 1, levelAtEntry: 0 }), "retry");
});

test("trackTower: entrada, andar novo zera as quedas, cada LOSE conta uma vez", () => {
  let p = newTowerProgress();
  p = trackTower(p, snap({ maxLevel: 13 }), 0);
  assert.equal(p.lastMaxLevel, 13);
  const inTowerAt = (floor: number, x: Partial<TowerSnapshot> = {}) =>
    snap({ sceneType: 16, sceneId: 102000 + floor, dialog: false, autoPlay: true, ...x });
  p = trackTower(p, inTowerAt(14), 1000);
  assert.deepEqual([p.entries, p.levelAtEntry, p.floor, p.failures], [1, 13, 14, 0]);
  p = trackTower(p, inTowerAt(14, { stageFailed: true }), 2000);
  p = trackTower(p, inTowerAt(14, { stageFailed: true }), 3000); // mesma tela: nao conta de novo
  assert.equal(p.failures, 1);
  p = trackTower(p, inTowerAt(14, { inWorld: false }), 4000); // Challenge again: recarrega
  p = trackTower(p, inTowerAt(14), 5000);
  p = trackTower(p, inTowerAt(14, { stageFailed: true }), 6000);
  assert.equal(p.failures, 2);
  p = trackTower(p, inTowerAt(15), 7000); // passou: andar novo
  assert.deepEqual([p.floor, p.failures], [15, 0]);
  p = trackTower(p, snap({ maxLevel: 14 }), 8000); // voltou pro mundo
  assert.deepEqual([p.inside, p.lastMaxLevel, p.entries], [false, 14, 1]);
});

test("entrada recusada: sem a cena da torre em 30 s, conta e para depois de 3", () => {
  const d = new TowerDriver({ ...DEFAULT_TOWER_CONFIG, sweep: false });
  let t = 0;
  let enters = 0;
  for (let i = 0; i < 400; i++, t += 1000) {
    const { step, send } = d.next(snap({}), t);
    if (step.kind === "done") break;
    if (step.kind === "act" && send && step.id === "enter") enters++;
  }
  assert.equal(enters, 3);
  assert.ok(t >= 3 * ENTER_TIMEOUT_MS);
});

test("TowerDriver: fechar repete ate o dialogo sumir e so entao conclui", () => {
  const d = new TowerDriver({ ...DEFAULT_TOWER_CONFIG, sweep: false, refreshOnFailure: false });
  d.progress = { ...d.progress, entries: 1 };
  assert.deepEqual([d.next(snap({}), 0).send, d.next(snap({}), 1000).send], [true, false]); // close, cooldown
  // Visto ao vivo: o 1o OnCloseDlg caiu na animacao de abrir e o dialogo ficou.
  const again = d.next(snap({}), 3000);
  assert.equal(again.step.kind === "act" && again.step.id, "close");
  assert.equal(again.send, true);
  assert.equal(d.next(snap({ dialog: false }), 4000).step.kind, "done");
});

test("na torre morto antes do LOSE espera, sem religar o auto-hunt", () => {
  assert.equal(id(snap({ sceneType: 16, sceneId: 102017, dialog: false, dead: true })), "wait");
});

test("TowerDriver: refresh espera 4 s antes de rerolar de novo", () => {
  const d = new TowerDriver();
  const res = snap({ sweepResult: true, multiple: 1.0, multipleText: "1.0x", freeRefreshes: 5 });
  assert.equal(d.next(res, 0).send, true);
  assert.equal(d.next(res, 2000).send, false);
  assert.equal(d.next(res, 4000).send, true);
});
