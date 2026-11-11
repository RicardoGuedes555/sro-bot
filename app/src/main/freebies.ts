// Gratis do dia por metodo (Event Pack, attendance, caixinha do Daily Pack, baus do
// sign-in e red envelopes da guilda): pede a lista da aba Event, o estado do sign-in
// e a lista de envelopes, pega um por vez com o nextFreebieStep e confere Diamond e
// Silk depois de cada pedido. Saldo mudou: para e nao pede mais nada ate reabrir o app.
// So chamadas de metodo: roda com o Treino cacando, sem pausar.

import { gameDay } from "../controller/daily";
import { DIAMOND_BODY, DONATE_INFO_BODY, FREEBIES_INFO_BODY, GUILD_SIGNIN_INFO_BODY, nextFreebieStep, readFreebiesSnapshot, RED_PACKET_LIST_BODY, SILK_BODY } from "../controller/freebies";
import { queryPlayer, sendCommand } from "./engine";

type Log = (msg: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SERVER_WAIT_MS = 2500;
const MAX_STEPS = 10;

// Dia do jogo em que o app ja marcou o attendance (trava contra o re-sign pago).
let checkinDay = -1;
// Saldo mudou depois de um pedido: nada mais ate reabrir o app.
let halted = "";

export async function runFreebies(
  host: string,
  port: number,
  log: Log = () => {},
  donate = false,
): Promise<{ ok: boolean; erro?: string; done?: number; reason?: string }> {
  if (halted) return { ok: false, erro: halted };
  const p0 = await queryPlayer(host, port);
  if (!p0.ok) return { ok: false, erro: "char nao esta em mundo" };
  const q = (tag: string, body: string) => sendCommand(host, port, tag, body);
  const int = async (body: string) => {
    const r = await q("GETP", body);
    return r.ok === true && typeof r.int === "number" ? r.int : undefined;
  };
  const tried = new Set<string>();
  let done = 0;
  await q("SKIL", FREEBIES_INFO_BODY);
  await q("SKIL", GUILD_SIGNIN_INFO_BODY);
  await q("SKIL", RED_PACKET_LIST_BODY);
  if (donate) {
    await q("SKIL", DONATE_INFO_BODY);
    await q("SKIL", "calls XGuildDailyTaskDocument SendGetDailyTaskInfo 0");
  }
  await sleep(SERVER_WAIT_MS);
  for (let i = 0; i < MAX_STEPS; i++) {
    const s = await readFreebiesSnapshot(q);
    const step = nextFreebieStep(s, tried, checkinDay === gameDay(), donate);
    if (step.kind === "done") return { ok: true, done, reason: step.reason };
    if (step.kind === "fail") return { ok: false, erro: step.reason, done };
    log(step.name);
    tried.add(step.key);
    if (step.key === "checkin") checkinDay = gameDay();
    await q("SKIL", step.body);
    await sleep(SERVER_WAIT_MS);
    // Uma leitura falha nao e saldo mudado: tenta de novo antes de parar.
    const reread = async (body: string) => (await int(body)) ?? (await sleep(1000), await int(body));
    const diamond = await reread(DIAMOND_BODY);
    const silk = await reread(SILK_BODY);
    if (diamond !== s?.diamond || silk !== s?.silk) {
      halted = `Diamond/Silk mudaram depois de "${step.name}" (${s?.diamond}/${s?.silk} -> ${diamond}/${silk}); gratis do dia parado ate reabrir o app`;
      log(halted);
      return { ok: false, erro: halted, done };
    }
    done++;
  }
  return { ok: false, erro: "limite de acoes", done };
}
