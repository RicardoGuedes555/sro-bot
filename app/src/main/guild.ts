// Guild utilities por metodo: pede o estado ao servidor, decide UMA acao com o
// nextGuildStep e manda, ate concluir (cada acao uma vez por passada).

import { type GuildConfig, nextGuildStep, readGuildSnapshot, requestGuildInfo } from "../controller/guild";
import { queryPlayer, sendCommand } from "./engine";

type Log = (msg: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// O estado so atualiza com a resposta do servidor.
const SERVER_WAIT_MS = 2500;
const MAX_STEPS = 12;
const GUILD_INFO_WAIT_MS = 20000;

let stopRequested = false;

export function stopGuild(): void {
  stopRequested = true;
}

export async function runGuild(
  host: string,
  port: number,
  cfg: GuildConfig,
  log: Log = () => {},
): Promise<{ ok: boolean; erro?: string; done?: number }> {
  stopRequested = false;
  const p0 = await queryPlayer(host, port);
  if (!p0.ok) {
    log("char nao esta em mundo; nao iniciado.");
    return { ok: false, erro: "char nao esta em mundo" };
  }
  const q = (tag: string, body: string) => sendCommand(host, port, tag, body);
  const tried = new Set<string>();
  const t0 = Date.now();
  for (let i = 0; i < MAX_STEPS; i++) {
    if (stopRequested) {
      log("parado.");
      return { ok: false, erro: "parado", done: tried.size };
    }
    await requestGuildInfo(q);
    await sleep(SERVER_WAIT_MS);
    const s = await readGuildSnapshot(q);
    // A guilda chega alguns segundos depois de entrar em mundo (visto ao vivo:
    // logo apos o login o get_bInGuild ainda era false).
    if (s?.inWorld && !s.inGuild && Date.now() - t0 < GUILD_INFO_WAIT_MS) {
      i--;
      continue;
    }
    const step = nextGuildStep(s, cfg, tried);
    if (step.kind === "done") {
      log(`concluido: ${step.reason}.`);
      return { ok: true, done: tried.size };
    }
    if (step.kind === "fail") {
      log(`falhou: ${step.reason}.`);
      return { ok: false, erro: step.reason, done: tried.size };
    }
    log(step.name);
    await q("SKIL", step.body);
    tried.add(step.key);
    await sleep(SERVER_WAIT_MS);
  }
  log("muitas acoes numa passada; parando por seguranca.");
  return { ok: false, erro: "limite de acoes", done: tried.size };
}
