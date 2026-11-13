import assert from "node:assert";
import { test } from "node:test";

import {
  DEFAULT_GUILD_BOSS_CONFIG,
  ENTER_BOSS_BODY,
  EXIT_REWARD_BODY,
  type GuildBossSnapshot,
  LEAVE_TEAM_BODY,
  nextGuildBossStep,
} from "../guildboss";

function baseSnap(p: Partial<GuildBossSnapshot> = {}): GuildBossSnapshot {
  return {
    inWorld: true,
    inGuild: true,
    inTeam: false,
    sceneId: 3,
    inBossScene: false,
    bossOpen: true,
    timeLeft: 600,
    goldBuffCount: 0,
    inSafeRegion: false,
    wipeActive: false,
    rewardVisible: false,
    dead: false,
    autoPlay: true,
    gold: 500000,
    ...p,
  };
}

test("fora da guilda conclui direto", () => {
  const step = nextGuildBossStep(baseSnap({ inGuild: false }), DEFAULT_GUILD_BOSS_CONFIG);
  assert.equal(step.kind, "done");
});

test("se estiver em equipe, sai da party primeiro", () => {
  const step = nextGuildBossStep(baseSnap({ inTeam: true }), DEFAULT_GUILD_BOSS_CONFIG);
  assert.equal(step.kind, "act");
  if (step.kind === "act") {
    assert.equal(step.id, "leave-team");
    assert.equal(step.body, LEAVE_TEAM_BODY);
  }
});

test("compra buffs por gold ate o limite configurado antes de entrar", () => {
  const cfg = { ...DEFAULT_GUILD_BOSS_CONFIG, goldBuffsMax: 3 };
  const step0 = nextGuildBossStep(baseSnap({ goldBuffCount: 0 }), cfg);
  assert.equal(step0.kind, "act");
  if (step0.kind === "act") assert.equal(step0.id, "buff-0");

  const step2 = nextGuildBossStep(baseSnap({ goldBuffCount: 2 }), cfg);
  assert.equal(step2.kind, "act");
  if (step2.kind === "act") assert.equal(step2.id, "buff-2");

  // Atingiu o limite (3): vai para a entrada da arena
  const step3 = nextGuildBossStep(baseSnap({ goldBuffCount: 3 }), cfg);
  assert.equal(step3.kind, "act");
  if (step3.kind === "act") {
    assert.equal(step3.id, "enter");
    assert.equal(step3.body, ENTER_BOSS_BODY);
  }
});

test("se nao tiver gold suficiente para o buff, pula a compra e entra no boss", () => {
  const cfg = { ...DEFAULT_GUILD_BOSS_CONFIG, goldBuffsMax: 3 };
  const step = nextGuildBossStep(baseSnap({ goldBuffCount: 0, gold: 500 }), cfg);
  assert.equal(step.kind, "act");
  if (step.kind === "act") {
    assert.equal(step.id, "enter");
    assert.equal(step.body, ENTER_BOSS_BODY);
  }
});

test("se o evento estiver fechado aguarda horario oficial", () => {
  const step = nextGuildBossStep(baseSnap({ bossOpen: false, timeLeft: 0 }), DEFAULT_GUILD_BOSS_CONFIG);
  assert.equal(step.kind, "wait");
});

test("dentro da arena: combate e tela de recompensa ao finalizar", () => {
  const arenaSnap = baseSnap({ inBossScene: true, sceneId: 2200, autoPlay: false });
  // Sem autoPlay: manda ligar auto-ataque
  const fightStep = nextGuildBossStep(arenaSnap, DEFAULT_GUILD_BOSS_CONFIG);
  assert.equal(fightStep.kind, "act");
  if (fightStep.kind === "act") {
    assert.equal(stepBody(fightStep), '{"on":1}');
  }

  // Fim do boss: tela de recompensa visivel -> clica no botao Continue
  const endStep = nextGuildBossStep(baseSnap({ inBossScene: true, sceneId: 2200, rewardVisible: true }), DEFAULT_GUILD_BOSS_CONFIG);
  assert.equal(endStep.kind, "act");
  if (endStep.kind === "act") {
    assert.equal(endStep.id, "reward");
    assert.equal(endStep.body, EXIT_REWARD_BODY);
  }
});

test("dentro da arena: desvio da safe zone durante golpe supremo", () => {
  const wipeSnap = baseSnap({
    inBossScene: true,
    sceneId: 2200,
    wipeActive: true,
    inSafeRegion: false,
    safePos: [100, 20, 200],
  });
  const step = nextGuildBossStep(wipeSnap, DEFAULT_GUILD_BOSS_CONFIG);
  assert.equal(step.kind, "move");
  if (step.kind === "move") {
    assert.deepEqual(step.pos, [100, 20, 200]);
  }

  // Ja dentro da safe zone: segura na defensiva
  const safeSnap = baseSnap({
    inBossScene: true,
    sceneId: 2200,
    wipeActive: true,
    inSafeRegion: true,
    autoPlay: false,
  });
  const safeStep = nextGuildBossStep(safeSnap, DEFAULT_GUILD_BOSS_CONFIG);
  assert.equal(safeStep.kind, "wait");
});

function stepBody(s: ReturnType<typeof nextGuildBossStep>): string {
  return s.kind === "act" ? s.body : "";
}

