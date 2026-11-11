// Continental Exploration 100% por metodo e guiado por estado. Le o tabuleiro e
// os baus pelo engine (readContinentalSnapshot), decide UMA acao com o
// ContinentalDriver e manda o comando, ate o ciclo fechar.

import { AimTracker, atSpotHpStop, type ContinentalConfig, ContinentalDriver, inInstanceScene, readContinentalSnapshot } from "../controller/continental";
import { hpPercent } from "../controller/train";
import { queryPlayer, sendCommand } from "./engine";

type Log = (msg: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Teto de seguranca: 10 dados de ~3 s cada mais os baus cabem com folga.
const RUN_TIMEOUT_MS = 20 * 60 * 1000;

let stopRequested = false;

const CLOSE_BODY = "calls SuperRiskDlg SetVisible 2 0 1";

// Pede pro ciclo em andamento parar na proxima volta (botao Parar bot).
export function stopContinental(): void {
  stopRequested = true;
}

// `restart` = travou e a config pede reiniciar o jogo (quem chama reabre).
export async function runContinental(
  host: string,
  port: number,
  cfg: ContinentalConfig,
  log: Log = () => {},
  timeoutMs = RUN_TIMEOUT_MS,
): Promise<{ ok: boolean; erro?: string; restart?: boolean }> {
  stopRequested = false;
  const p = await queryPlayer(host, port);
  if (!p.ok) {
    log("char nao esta em mundo; nao iniciado.");
    return { ok: false, erro: "char nao esta em mundo" };
  }
  const q = (tag: string, body: string) => sendCommand(host, port, tag, body);
  // No ponto (caca ligada): mesma regra da saida segura do Treino pra comecar.
  const hpNow = async () => {
    const c = await q("CONN", "");
    const pl = c.player as Record<string, unknown> | undefined;
    return pl ? hpPercent(pl.hp, pl.maxHp) : undefined;
  };
  if (cfg.atSpot) {
    const stop = atSpotHpStop(await hpNow(), true, false);
    if (stop) {
      log(`${stop}.`);
      return { ok: false, erro: "HP baixo no ponto" };
    }
  }
  const driver = new ContinentalDriver(cfg);
  const aim = new AimTracker();
  const t0 = Date.now();
  let lastWait = "";
  while (Date.now() - t0 < timeoutMs) {
    if (stopRequested) {
      log("parado pelo usuario.");
      return { ok: false, erro: "parado" };
    }
    const s = await readContinentalSnapshot(q);
    // No ponto, HP caindo fora da arena: fecha o tabuleiro e deixa pra depois (a
    // caca do jogo segue ligada; na arena perder nao custa EXP).
    if (cfg.atSpot && s) {
      const stop = atSpotHpStop(await hpNow(), false, inInstanceScene(s));
      if (stop) {
        if (s.dialog) await q("SKIL", CLOSE_BODY);
        log(`${stop}.`);
        return { ok: false, erro: "HP baixo no ponto" };
      }
    }
    const landed = aim.observe(s?.pathAt);
    if (landed)
      log(`dado andou ${landed.steps} (mirou ${2 * landed.band - 1}-${2 * landed.band}): ${landed.hit ? "acertou" : "errou"}`);
    const { step, send } = driver.next(s, Date.now());
    const pr = driver.progress;
    if (step.kind === "done") {
      log(`concluido (${step.reason}): ${pr.rolls} rolagem(ns), ${pr.unlocked} bau(s) destravado(s), ` +
        `${pr.taken} pego(s), ${pr.discarded} descartado(s)` +
        (aim.total ? `, mira ${aim.hits}/${aim.total}.` : "."));
      return { ok: true };
    }
    if (step.kind === "fail") {
      log(`falhou: ${step.reason}.`);
      return { ok: false, erro: step.reason, restart: cfg.restartWhenStuck && !cfg.atSpot };
    }
    if (step.kind === "wait") {
      if (step.reason !== lastWait) log(step.reason);
      lastWait = step.reason;
    } else if (send) {
      lastWait = "";
      log(step.name);
      if (step.id === "roll") aim.rolled(s?.pathAt, step.body, step.name.includes("mirando"));
      await q(step.tag, step.body);
    }
    await sleep(1000);
  }
  log("timeout do ciclo do Continental Exploration.");
  return { ok: false, erro: "timeout", restart: cfg.restartWhenStuck && !cfg.atSpot };
}
