// Demon Locking Tower 100% por metodo e guiado por estado. Le o estado do
// evento pelo engine (readTowerSnapshot), decide UMA acao com o TowerDriver e
// manda o comando, ate o ciclo fechar. Substitui a versao por tempo (que
// tambem pagava o "Sweep now" com OnQuickStartSweep).

import { type DemonTowerConfig, readTowerSnapshot, TowerDriver } from "../controller/tower";
import { hpPercent, readEnemiesAround, readTrainSnapshot, safeToStopHunt } from "../controller/train";
import { queryPlayer, sendCommand } from "./engine";

type Log = (msg: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Teto de seguranca: a torre tem 300 andares de ~35 s cada.
const RUN_TIMEOUT_MS = 4 * 60 * 60 * 1000;

let stopRequested = false;

// Pede pro ciclo em andamento parar na proxima volta (botao Parar bot).
export function stopDemonTower(): void {
  stopRequested = true;
}

export async function runDemonTower(
  host: string,
  port: number,
  cfg: DemonTowerConfig,
  log: Log = () => {},
  timeoutMs = RUN_TIMEOUT_MS,
): Promise<{ ok: boolean; erro?: string }> {
  stopRequested = false;
  const p = await queryPlayer(host, port);
  if (!p.ok) {
    log("char nao esta em mundo; nao iniciado.");
    return { ok: false, erro: "char nao esta em mundo" };
  }
  const q = (tag: string, body: string) => sendCommand(host, port, tag, body);
  const driver = new TowerDriver(cfg);
  const t0 = Date.now();
  let lastWait = "";
  // Fim da torre: o char volta pro lugar de antes, que pode ser o ponto de caca.
  // So desliga a caca que a torre ligou com o char seguro (mesma regra do Parar bot).
  const finish = async () => {
    if (!driver.autoFightOn) return;
    const s = await readTrainSnapshot(q);
    if (!s || s.dead) return;
    const near = s.inWorld ? await readEnemiesAround(q, s.pos) : 0;
    if (!safeToStopHunt(s.inCombat, near, hpPercent(s.hp, s.maxHp))) {
      log("caca deixada ligada (em combate, HP baixo ou monstro perto).");
      return;
    }
    await q("SKIL", '{"on":0}');
  };
  while (Date.now() - t0 < timeoutMs) {
    if (stopRequested) {
      await finish();
      log("parado pelo usuario.");
      return { ok: false, erro: "parado" };
    }
    const s = await readTowerSnapshot(q);
    const { step, send } = driver.next(s, Date.now());
    if (step.kind === "done") {
      await finish();
      const pr = driver.progress;
      log(`concluido: ${pr.entries} entrada(s) na torre, andar mais alto ${pr.lastMaxLevel}.`);
      return { ok: true };
    }
    if (step.kind === "wait") {
      if (step.reason !== lastWait) log(step.reason);
      lastWait = step.reason;
    } else if (send) {
      lastWait = "";
      log(step.name);
      await q(step.tag, step.body);
    }
    await sleep(1500);
  }
  await finish();
  log("timeout do ciclo da torre.");
  return { ok: false, erro: "timeout" };
}
