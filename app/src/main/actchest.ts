// Baus de atividade diaria por metodo: pede o estado ao servidor, pega um bau
// liberado por vez com o nextActChestStep, ate concluir. So chamadas de metodo:
// roda com o Treino cacando, sem pausar.

import { nextActChestStep, readActChestSnapshot, requestActChestInfo } from "../controller/actchest";
import { queryPlayer, sendCommand } from "./engine";

type Log = (msg: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SERVER_WAIT_MS = 2500;
const MAX_STEPS = 8;

export async function runActChests(
  host: string,
  port: number,
  log: Log = () => {},
): Promise<{ ok: boolean; erro?: string; done?: number; reason?: string }> {
  const p0 = await queryPlayer(host, port);
  if (!p0.ok) return { ok: false, erro: "char nao esta em mundo" };
  const q = (tag: string, body: string) => sendCommand(host, port, tag, body);
  const tried = new Set<string>();
  for (let i = 0; i < MAX_STEPS; i++) {
    await requestActChestInfo(q);
    await sleep(SERVER_WAIT_MS);
    const step = nextActChestStep(await readActChestSnapshot(q), tried);
    if (step.kind === "done") return { ok: true, done: tried.size, reason: step.reason };
    if (step.kind === "fail") return { ok: false, erro: step.reason, done: tried.size };
    log(step.name);
    await q("SKIL", step.body);
    tried.add(step.key);
  }
  return { ok: false, erro: "limite de acoes", done: tried.size };
}
