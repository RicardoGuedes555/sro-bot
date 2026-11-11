import assert from "node:assert";
import { test } from "node:test";

import { describeBase, type LibBase, planInject } from "../libstate";

const DIR = "/data/app/com.silkroad.mb-AYsI-yUTuAlWJR31x7SdCg==/lib/arm64";
const OURS = "4d2b861d063c31841976fbd72f13e61b";
const GAME = "c18dc847dd9570eac7e8d22aec4a683e";
const OTHER = "0123456789abcdef0123456789abcdef"; // loader de terceiros (ficticio)

const base = (p: Partial<LibBase>): LibBase =>
  ({ libDir: DIR, mainMd5: OTHER, coreExisted: true, coreMd5: GAME, savedAt: "", ...p });

test("jogo limpo (sem libcore) e com outro loader viram injecao nova", () => {
  assert.deepEqual(planInject(DIR, GAME, false, OURS, null), { kind: "fresh", mode: "clean" });
  assert.deepEqual(planInject(DIR, OTHER, true, OURS, null), { kind: "fresh", mode: "loader" });
  // Base velha guardada nao impede de guardar a nova (o aparelho mudou).
  assert.equal(planInject(DIR, GAME, false, OURS, base({})).kind, "fresh");
});

test("ja injetado: usa a base guardada da mesma instalacao; sem ela reconstroi", () => {
  const b = base({});
  assert.deepEqual(planInject(DIR, OURS, true, OURS, b), { kind: "refresh", base: b });
  assert.deepEqual(planInject(DIR, OURS, true, OURS, null), { kind: "legacy" });
  // APK reinstalado: a pasta mudou e a base e de outra instalacao.
  assert.deepEqual(planInject("/data/app/com.silkroad.mb-NOVO/lib/arm64", OURS, true, OURS, b), { kind: "legacy" });
});

test("descricao da base pro log", () => {
  assert.equal(describeBase(base({})), "outro loader (01234567)");
  assert.equal(describeBase(base({ mainMd5: GAME, coreExisted: false })), "jogo limpo");
  assert.equal(describeBase(base({ mainMd5: "abcdef0123456789" })), "outro loader (abcdef01)");
});

// 2026-11-09 10:08: adb falhou na hora e o app reiniciou o jogo com o Heroi cacando.
test("reabrir o app: engine em mundo reconecta; adb sem resposta nunca reinicia o jogo", async () => {
  const { gameStateFromPidof, reconnectPlan } = await import("../libstate");
  assert.equal(gameStateFromPidof("22603\n"), "running");
  assert.equal(gameStateFromPidof("22603 22650"), "running");
  assert.equal(gameStateFromPidof("none\r\n"), "stopped");
  assert.equal(gameStateFromPidof(""), "unknown"); // adb respondeu vazio
  assert.equal(gameStateFromPidof(undefined), "unknown");
  assert.equal(gameStateFromPidof("error: closed"), "unknown");
  assert.equal(reconnectPlan(true, "unknown"), "reconnect"); // o engine respondeu: nem olha o adb
  assert.equal(reconnectPlan(false, "unknown"), "abort"); // o caso de 10:08
  assert.equal(reconnectPlan(false, "stopped"), "inject");
  assert.equal(reconnectPlan(false, "running"), "inject"); // jogo aberto sem engine ou fora de mundo: como antes
});
