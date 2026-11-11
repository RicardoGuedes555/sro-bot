import assert from "node:assert";
import { test } from "node:test";

import {
  AutoBattleGoal,
  DemonLockingTowerGoal,
  type TowerIo,
  buildActivity,
  type PlayerSnapshot,
  snapshotFromEngine,
} from "../activities";
import { GoalStatus } from "../goals";
import { DEFAULT_TOWER_CONFIG, emptyTowerSnapshot, type TowerSnapshot } from "../tower";

function snap(p: Partial<PlayerSnapshot>): PlayerSnapshot {
  return { ok: true, inWorld: true, dead: false, inCombat: false, hp: 100, maxHp: 100, ...p };
}

function setup(initial: PlayerSnapshot | null) {
  const calls: boolean[] = [];
  let cur = initial;
  const combat = { setAutoFight: (on: boolean) => calls.push(on) };
  const goal = new AutoBattleGoal(combat, () => cur, "treino");
  return { goal, calls, set: (p: PlayerSnapshot | null) => (cur = p) };
}

test("fora de mundo nao liga o auto-battle", () => {
  const { goal, calls } = setup(snap({ inWorld: false }));
  assert.equal(goal.process(), GoalStatus.ACTIVE);
  assert.deepEqual(calls, []);
});

test("sem leitura espera sem agir", () => {
  const { goal, calls } = setup(null);
  assert.equal(goal.process(), GoalStatus.ACTIVE);
  assert.deepEqual(calls, []);
});

test("em mundo e vivo liga uma vez e nao repete", () => {
  const { goal, calls } = setup(snap({}));
  goal.process();
  goal.process();
  goal.process();
  assert.deepEqual(calls, [true]);
});

test("morto reseta e religa ao voltar vivo", () => {
  const { goal, calls, set } = setup(snap({}));
  goal.process(); // liga
  set(snap({ dead: true }));
  goal.process(); // morto: reseta
  set(snap({ dead: false }));
  goal.process(); // vivo de novo: religa
  assert.deepEqual(calls, [true, true]);
});

test("terminate desliga o auto-battle se estava ligado", () => {
  const { goal, calls } = setup(snap({}));
  goal.process(); // liga
  goal.terminate();
  assert.deepEqual(calls, [true, false]);
});

test("buildActivity: train devolve goal, desconhecida devolve null", () => {
  const combat = { setAutoFight: () => {} };
  const src = () => null;
  assert.ok(buildActivity("train", combat, src));
  assert.equal(buildActivity("daily", combat, src), null);
  assert.equal(buildActivity("qin-tomb-war", combat, src), null);
});

test("snapshotFromEngine: fora de mundo, em mundo e lixo", () => {
  assert.equal(snapshotFromEngine(null), null);
  assert.equal(snapshotFromEngine("x"), null);
  const fora = snapshotFromEngine({ ok: false, erro: "nulo" });
  assert.equal(fora?.ok, false);
  assert.equal(fora?.inWorld, false);
  const dentro = snapshotFromEngine({ ok: true, dead: false, inCombat: true, hp: 2638, maxHp: 2638 });
  assert.deepEqual(dentro, { ok: true, inWorld: true, dead: false, inCombat: true, hp: 2638, maxHp: 2638 });
});

test("AutoBattleGoal consome snapshot do engine fim-a-fim (liga em mundo)", () => {
  const calls: boolean[] = [];
  let payload: unknown = { ok: false };
  const goal = new AutoBattleGoal(
    { setAutoFight: (on) => calls.push(on) },
    () => snapshotFromEngine(payload),
  );
  goal.process(); // fora de mundo
  payload = { ok: true, dead: false, hp: 100, maxHp: 100 };
  goal.process(); // em mundo: liga
  assert.deepEqual(calls, [true]);
});

// ---- DemonLockingTowerGoal ----

function fakeTower(initial: TowerSnapshot | null) {
  const sent: string[] = [];
  let cur = initial;
  const io: TowerIo = { send: (_tag, body) => sent.push(body), state: () => cur };
  return { io, sent, set: (s: TowerSnapshot | null) => (cur = s) };
}

const world = (p: Partial<TowerSnapshot> = {}): TowerSnapshot => ({
  ...emptyTowerSnapshot(), inWorld: true, sceneType: 76, sceneId: 100001, dialog: true, dataReady: true,
  maxLevel: 5, topFloor: 300, sweepsLeft: 0, ...p,
});

test("DemonLockingTowerGoal: entra, sobe, cai, volta e fecha pelo estado", () => {
  const cfg = { ...DEFAULT_TOWER_CONFIG, sweep: false, refreshOnFailure: false };
  const { io, sent, set } = fakeTower(world({ dialog: false }));
  const clock = { t: 0 };
  const goal = new DemonLockingTowerGoal(io, cfg, () => clock.t);
  const step = (s: TowerSnapshot) => {
    set(s);
    clock.t += 6000;
    return goal.process();
  };
  assert.equal(step(world({ dialog: false })), GoalStatus.ACTIVE); // abre
  step(world()); // entra
  step(world({ sceneType: 16, sceneId: 102006, dialog: false })); // na torre, auto-hunt off: liga
  step(world({ sceneType: 16, sceneId: 102009, dialog: false, autoPlay: true })); // subindo
  step(world({ sceneType: 16, sceneId: 102009, dialog: false, autoPlay: true, stageFailed: true })); // LOSE
  step(world({ dialog: false })); // voltou: abre o dialogo
  assert.equal(step(world({ maxLevel: 8 })), GoalStatus.ACTIVE); // ja subiu neste ciclo: fecha
  assert.equal(step(world({ dialog: false })), GoalStatus.COMPLETED); // fechou de fato
  assert.deepEqual(sent, [
    "calls ActivityTeamTowerSingleDlg SetVisible 2 1 1",
    "callsn ActivityTeamTowerSingleDlg OnEnterBattle 1",
    '{"on":1}',
    "callp XLevelRewardView _StageFailHandler OnReturnButtonClicked 1",
    "calls ActivityTeamTowerSingleDlg SetVisible 2 1 1",
    "callsn ActivityTeamTowerSingleDlg OnCloseDlg 1",
  ]);
  goal.terminate(); // ligou o auto-hunt: desliga no fim
  assert.equal(sent[sent.length - 1], '{"on":0}');
});

test("DemonLockingTowerGoal: sem leitura nao age e nao conclui", () => {
  const { io, sent } = fakeTower(null);
  const goal = new DemonLockingTowerGoal(io, DEFAULT_TOWER_CONFIG, () => 0);
  for (let i = 0; i < 5; i++) assert.equal(goal.process(), GoalStatus.ACTIVE);
  assert.deepEqual(sent, []);
  goal.terminate(); // nao ligou nada: nao manda nada
  assert.deepEqual(sent, []);
});

test("buildActivity: demon_locking_tower precisa do TowerIo", () => {
  const combat = { setAutoFight: () => {} };
  const src = () => null;
  const { io } = fakeTower(null);
  assert.ok(buildActivity("demon_locking_tower", combat, src, io));
  assert.ok(buildActivity("demontower", combat, src, io));
  assert.equal(buildActivity("demon_locking_tower", combat, src), null); // sem io
});
