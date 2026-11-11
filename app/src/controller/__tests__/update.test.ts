import assert from "node:assert";
import { test } from "node:test";

import {
  CONFIRM_COOLDOWN_MS,
  ProgressEta,
  RETRY_COOLDOWN_MS,
  UPDATE_PHASE,
  describeProgress,
  floatFromBits,
  formatDuration,
  nextUpdateStep,
  updateActive,
  updateMakingProgress,
} from "../update";

test("floatFromBits decodifica os bits que o GETP devolve (valores vistos ao vivo)", () => {
  // Amostras vistas ao vivo: mTotalProgress (0.3363 = "33,6%") e _remainingTime (273.93 s).
  assert.ok(Math.abs(floatFromBits(1051471251) - 0.3363) < 0.001);
  assert.ok(Math.abs(floatFromBits(1133049746) - 273.93) < 0.01);
  assert.strictEqual(floatFromBits(0), 0);
});

test("NONE e FINISH nao sao atualizacao; ERROR e as fases do meio sao", () => {
  assert.strictEqual(updateActive(UPDATE_PHASE.NONE), false);
  assert.strictEqual(updateActive(UPDATE_PHASE.FINISH), false);
  assert.strictEqual(updateActive(UPDATE_PHASE.ERROR), true);
  assert.strictEqual(updateActive(UPDATE_PHASE.DOWNLOAD_BUNDLE), true);
  assert.strictEqual(updateActive(UPDATE_PHASE.ENDING), true);
  assert.deepStrictEqual(nextUpdateStep({ phase: UPDATE_PHASE.FINISH }), { kind: "none" });
});

test("dialogo de versao nova: confirma pelo callback do XUpdater", () => {
  const st = nextUpdateStep({ phase: UPDATE_PHASE.DOWNLOAD_CONFIRM, totalBytes: 512194311 });
  assert.strictEqual(st.kind, "act");
  if (st.kind === "act") {
    assert.strictEqual(st.body, "callsn XUpdater OnUpdateAssetConfirmCallBack 0");
    assert.strictEqual(st.cooldownMs, CONFIRM_COOLDOWN_MS);
  }
});

test("falha ao checar versao: tenta de novo com intervalo", () => {
  const st = nextUpdateStep({ phase: UPDATE_PHASE.ERROR });
  assert.strictEqual(st.kind, "act");
  if (st.kind === "act") {
    assert.strictEqual(st.body, "callsn XUpdater OnRetry 0");
    assert.strictEqual(st.cooldownMs, RETRY_COOLDOWN_MS);
  }
});

test("APK novo pela loja: falha em vez de esperar pra sempre", () => {
  const st = nextUpdateStep({ phase: UPDATE_PHASE.DOWNLOAD_CONFIRM, appUpdate: true });
  assert.strictEqual(st.kind, "fail");
});

test("baixando e extraindo: espera, e o prazo do login anda junto", () => {
  assert.deepStrictEqual(nextUpdateStep({ phase: UPDATE_PHASE.DOWNLOAD_BUNDLE, progress: 0.3 }), {
    kind: "wait", reason: "baixando",
  });
  assert.strictEqual(nextUpdateStep({ phase: UPDATE_PHASE.EXTRACT_BUNDLE }).kind, "wait");
  assert.strictEqual(updateMakingProgress(UPDATE_PHASE.DOWNLOAD_BUNDLE), true);
  assert.strictEqual(updateMakingProgress(UPDATE_PHASE.EXTRACT_BUNDLE), true);
  // Checagem de versao travada nao estende o prazo (servidor fora vira timeout).
  assert.strictEqual(updateMakingProgress(UPDATE_PHASE.FETCH_CHECK_VERSION), false);
  assert.strictEqual(updateMakingProgress(UPDATE_PHASE.ERROR), false);
});

test("ProgressEta: velocidade constante da o tempo restante", () => {
  const eta = new ProgressEta(30000);
  eta.add(0, 0.2);
  eta.add(10000, 0.3); // 1% por segundo
  assert.ok(Math.abs((eta.rate() ?? 0) - 0.01) < 1e-9);
  assert.ok(Math.abs((eta.etaSeconds() ?? 0) - 70) < 1e-6);
});

test("ProgressEta: sem avanco ou com uma amostra so nao estima", () => {
  const eta = new ProgressEta();
  assert.strictEqual(eta.etaSeconds(), undefined);
  eta.add(0, 0.5);
  assert.strictEqual(eta.etaSeconds(), undefined);
  eta.add(5000, 0.5);
  assert.strictEqual(eta.etaSeconds(), undefined);
});

test("ProgressEta: janela deslizante descarta amostra velha", () => {
  const eta = new ProgressEta(10000);
  eta.add(0, 0.0);
  eta.add(5000, 0.5); // rajada inicial rapida
  eta.add(20000, 0.53);
  eta.add(25000, 0.56); // agora 0.6% por s
  assert.ok(Math.abs((eta.rate() ?? 0) - 0.006) < 1e-9);
});

test("ProgressEta: barra que volta recomeca a medicao", () => {
  const eta = new ProgressEta();
  eta.add(0, 0.8);
  eta.add(5000, 0.9);
  eta.add(6000, 0.05); // fase nova reusou a barra
  assert.strictEqual(eta.rate(), undefined);
});

test("formatDuration e describeProgress", () => {
  assert.strictEqual(formatDuration(45), "45s");
  assert.strictEqual(formatDuration(138), "2m18s");
  assert.strictEqual(formatDuration(-3), "0s");
  const eta = new ProgressEta();
  eta.add(0, 0.2);
  eta.add(10000, 0.3);
  const line = describeProgress(
    { phase: UPDATE_PHASE.DOWNLOAD_BUNDLE, progress: 0.3, totalBytes: 100 * 1024 * 1024, gameEtaS: 60 },
    eta,
  );
  assert.strictEqual(line, "baixando 30.0% (30/100 MB) a 1.0 MB/s, faltam ~1m10s (jogo: 1m00s)");
});
