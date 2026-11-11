import assert from "node:assert";
import { test } from "node:test";

import { EXP_KEEP_MS, expDropText, expRate, expWatchStep, type ExpPoint } from "../expwatch";

const MAX = 6553787657; // Lv.87
const MIN = 60000;

// Uma amostra por minuto ganhando perMin por minuto, a partir de t0.
function series(t0: number, minutes: number, perMin: number, start = 700e6, level = 87): ExpPoint[] {
  const out: ExpPoint[] = [];
  for (let i = 0; i <= minutes; i++) out.push({ ts: t0 + i * MIN, level, exp: start + i * perMin, maxExp: MAX, training: true });
  return out;
}

test("EXP/h pela janela, so com o Treino cacando e sem buraco grande", () => {
  const pts = series(0, 60, 400000); // 24 M/h
  assert.equal(Math.round(expRate(pts, 0, 60 * MIN, 30 * MIN) ?? 0), 24e6);
  assert.equal(expRate(pts, 0, 10 * MIN, 30 * MIN), undefined); // pouca cobertura
  const parado = pts.map((p) => ({ ...p, training: false }));
  assert.equal(expRate(parado, 0, 60 * MIN, 30 * MIN), undefined);
  // Level-up no meio soma o resto do nivel anterior.
  const up: ExpPoint[] = [
    { ts: 0, level: 87, exp: MAX - 100, maxExp: MAX, training: true },
    { ts: MIN, level: 88, exp: 300, maxExp: MAX * 2, training: true },
  ];
  assert.equal(expRate(up, 0, MIN, MIN), 400 * 60);
});

// O caso que o alarme cobre: o x10 do training time acaba e o EXP/h cai pra ~1/10.
test("alarme: avisa uma vez quando o EXP/h cai pra menos de 1/4 e some quando volta", () => {
  const t0 = 0;
  const alto = series(t0, 140, 400000); // 24 M/h por 2h20
  const fimAlto = alto[alto.length - 1];
  const baixo = series(fimAlto.ts, 25, 40000, fimAlto.exp).slice(1); // 2,4 M/h
  let w = { low: false };
  // Ainda no alto: nada.
  let r = expWatchStep(w, alto, fimAlto.ts);
  assert.equal(r.notify, undefined);
  const pts = [...alto, ...baixo].filter((p) => p.ts >= baixo[baixo.length - 1].ts - EXP_KEEP_MS);
  r = expWatchStep(w, pts, baixo[baixo.length - 1].ts);
  assert.ok(r.notify);
  // A referencia (2 h antes dos ultimos 20 min) pega o comeco da queda: ~23 M/h.
  assert.ok((r.notify?.ref ?? 0) > 20e6 && (r.notify?.recent ?? 0) < 3e6);
  w = r.watch;
  assert.equal(expWatchStep(w, pts, baixo[baixo.length - 1].ts).notify, undefined); // nao repete
  // Voltou (abriu o tempo de novo): limpa.
  const fimBaixo = baixo[baixo.length - 1];
  const volta = series(fimBaixo.ts, 25, 400000, fimBaixo.exp).slice(1);
  const pts2 = [...pts, ...volta];
  const r2 = expWatchStep(w, pts2, volta[volta.length - 1].ts);
  assert.equal(r2.cleared, true);
  assert.equal(r2.watch.low, false);
  assert.equal(expDropText(2.4e6, 24e6), "EXP/h caiu de 24,0 M/h pra 2,4 M/h nos ultimos 20 min. Confira no jogo se o training time (x10) acabou.");
});

test("alarme: troca pro ponto 2 (~0,64 do ponto 1) nao dispara", () => {
  const alto = series(0, 140, 400000);
  const fim = alto[alto.length - 1];
  const ponto2 = series(fim.ts, 25, 260000, fim.exp).slice(1); // 15,6 M/h
  const pts = [...alto, ...ponto2];
  assert.equal(expWatchStep({ low: false }, pts, ponto2[ponto2.length - 1].ts).notify, undefined);
});
