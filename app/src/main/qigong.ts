// Qigong por metodo. Pedir funciona de qualquer lugar, ate no ponto em combate
// (provado em 2026-11-09 17:49: "The invitation to transmit the practice has been
// sent"); aceito, o jogo leva os dois pro Guild Hall (cena 4) e o char fica la no
// fim: sai com ReqLeaveScene. Aceitar: uma checagem rapida (o convite some em 15 s).
// Pedir: um membro por vez, esperando o convite expirar antes do proximo.

import fs from "node:fs";
import path from "node:path";

import {
  ACCEPT_BODY,
  asksFromJson,
  asksToJson,
  GUILD_HALL_SCENE,
  hallIdleStep,
  LEAVE_HALL_BODY,
  memberObjvBody,
  QIGONG_ASK_AGAIN_MS,
  QIGONG_INVITE_WAIT_MS,
  QIGONG_MAX_REQUESTS,
  QIGONG_MISSES_PER_DAY,
  QIGONG_HALL_START_MS,
  QIGONG_MIN_HP_PCT,
  QIGONG_RUN_MAX_MS,
  type QigongAsk,
  qigongAsked,
  qigongCandidates,
  qigongRole,
  qigongSkipNames,
  qigongText,
  readQigongSnapshot,
  requestBody,
} from "../controller/qigong";
import { uidFromObjv } from "../controller/sell";
import { queryPlayer, sendCommand } from "./engine";

type Log = (msg: string) => void;
type Query = (tag: string, body: string) => Promise<Record<string, unknown>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SERVER_WAIT_MS = 2500;

let readObjv: (() => Promise<string>) | undefined;
export function setQigongObjvReader(fn: () => Promise<string>): void {
  readObjv = fn;
}

// Pedidos a cada membro (nome): sem resposta ou recusado pelo estado dele (o
// um membro deu "Unable to change another state"), so pede de novo depois de
// QIGONG_ASK_AGAIN_MS, e no maximo QIGONG_MISSES_PER_DAY vezes sem aceite por dia.
let asks = new Map<string, QigongAsk>();
let asksFile = "";

// Guarda os pedidos em userData/qigong-asks.json: reabrir o app nao zera a conta do dia.
export function setQigongDir(dir: string): void {
  asksFile = path.join(dir, "qigong-asks.json");
  try {
    asks = asksFromJson(JSON.parse(fs.readFileSync(asksFile, "utf8")), Date.now());
  } catch {
    asks = new Map();
  }
}

function saveAsks(): void {
  if (!asksFile) return;
  try {
    fs.writeFileSync(asksFile, JSON.stringify(asksToJson(asks), null, 2));
  } catch {
    /* sem disco: segue so na memoria */
  }
}

interface Place {
  scene?: number;
  pos?: number[];
  exp?: number;
  hpPct?: number;
  dead: boolean;
}

async function place(q: Query): Promise<Place> {
  const p = (await q("CONN", "")).player as Record<string, unknown> | undefined;
  const scene = (await q("GETP", "XScene get_SceneID")).int;
  const hpPct = p && typeof p.hp === "number" && typeof p.maxHp === "number" && p.maxHp > 0 ? (100 * p.hp) / p.maxHp : undefined;
  return {
    scene: typeof scene === "number" ? scene : undefined,
    pos: Array.isArray(p?.corrected) ? (p?.corrected as number[]) : undefined,
    exp: typeof p?.exp === "number" ? p.exp : undefined,
    hpPct,
    dead: p?.dead === true,
  };
}

const where = (p: Place) => `cena ${p.scene ?? "?"} em ${p.pos ? `${Math.round(p.pos[0])}, ${Math.round(p.pos[2])}` : "?"}`;

// Trava minima: o jogo leva os dois pra area segura, mas nao comeca com o char
// morto nem quase morrendo.
function unsafeReason(p: Place): string | null {
  if (p.dead) return "char morto";
  if (p.hpPct !== undefined && p.hpPct < QIGONG_MIN_HP_PCT) return `HP abaixo de ${QIGONG_MIN_HP_PCT}%`;
  return null;
}

const inheriting = async (q: Query) => (await q("GETP", "XGuildInheritDocument m_Inheriting")).bool === true;

// Sai do Guild Hall e espera a cena mudar.
async function leaveGuildHall(q: Query, log: Log): Promise<boolean> {
  log("saindo do Guild Hall.");
  await q("SKIL", LEAVE_HALL_BODY);
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const p = await place(q);
    if (p.scene !== undefined && p.scene !== GUILD_HALL_SCENE) {
      log(`saiu do Guild Hall: ${where(p)}.`);
      return true;
    }
  }
  log("o char nao saiu do Guild Hall em 30 s.");
  return false;
}

// Espera o Qigong comecar (m_Inheriting) e terminar. Ir pro Guild Hall tambem
// conta como aceito: o Qigong so comeca depois que os dois chegam, entao a espera
// recomeca la. No fim sai do Guild Hall. Loga onde o char estava e o EXP ganho.
async function waitQigong(q: Query, startWaitMs: number, who: string, log: Log): Promise<boolean> {
  const before = await place(q);
  let t0 = Date.now();
  let started = false;
  let inHall = before.scene === GUILD_HALL_SCENE;
  while (Date.now() - t0 < (started ? QIGONG_RUN_MAX_MS : inHall ? QIGONG_HALL_START_MS : startWaitMs)) {
    await sleep(2000);
    const on = await inheriting(q);
    const now = await place(q);
    if (!inHall && now.scene === GUILD_HALL_SCENE) {
      inHall = true;
      t0 = Date.now();
      log(`${who} aceitou: char levado ao Guild Hall (antes ${where(before)}).`);
    }
    if (on && !started) {
      started = true;
      t0 = Date.now();
      log(`Qigong com ${who} comecou: antes ${where(before)}, agora ${where(now)}.`);
    }
    if (started && !on) break;
  }
  const after = await place(q);
  if (started) {
    const gain = before.exp !== undefined && after.exp !== undefined ? after.exp - before.exp : undefined;
    log(`Qigong com ${who} concluido${gain !== undefined ? `: +${fmtM(gain)} de EXP` : ""}; char em ${where(after)}.`);
  } else if (inHall) log(`o Qigong com ${who} nao comecou no Guild Hall em ${QIGONG_HALL_START_MS / 1000} s.`);
  if (after.scene === GUILD_HALL_SCENE && !(await inheriting(q))) await leaveGuildHall(q, log);
  return started || inHall;
}

// Rede de seguranca: char parado no Guild Hall (sem Qigong nem convite) sai depois
// de QIGONG_HALL_IDLE_MS. Roda a cada poucos segundos: fora de la, uma leitura so.
let hallIdleSince = 0;
export async function runGuildHallCheck(host: string, port: number, log: Log = () => {}, now = Date.now()): Promise<{ ok: boolean; left?: boolean }> {
  const q: Query = (tag, body) => sendCommand(host, port, tag, body);
  const scene = (await q("GETP", "XScene get_SceneID")).int;
  const inHall = scene === GUILD_HALL_SCENE;
  const busy = inHall && ((await inheriting(q)) || (await q("GETP", "XGuildInheritConfirm m_CurrentInviteData get_lvl")).ok === true);
  const step = hallIdleStep(inHall, busy, hallIdleSince, now);
  hallIdleSince = step.idleSince;
  if (!step.leave) return { ok: true };
  hallIdleSince = 0;
  log(`char parado no Guild Hall ha ${Math.round((now - step.idleSince) / 1000)} s sem Qigong.`);
  return { ok: true, left: await leaveGuildHall(q, log) };
}

const fmtM = (v: number) => `${(v / 1e6).toFixed(2).replace(".", ",")} M`;

// Aceita o convite aberto, se houver e se der (diferenca de nivel, vezes, HP).
export async function runQigongAccept(host: string, port: number, log: Log = () => {}): Promise<{ ok: boolean; accepted?: string; erro?: string }> {
  const q: Query = (tag, body) => sendCommand(host, port, tag, body);
  // Roda a cada poucos segundos: sem convite aberto, uma leitura so.
  if ((await q("GETP", "XGuildInheritConfirm m_CurrentInviteData get_lvl")).ok !== true) return { ok: true };
  const s = await readQigongSnapshot(q, false);
  if (!s?.inWorld) return { ok: false, erro: "char fora de mundo" };
  if (!s.invite || s.inheriting) return { ok: true };
  const who = `${s.invite.name} (Lv.${s.invite.level})`;
  if (!qigongRole(s, s.invite.level)) {
    log(`convite de Qigong de ${who} ignorado: ${qigongText(s)}.`);
    return { ok: true };
  }
  const unsafe = unsafeReason(await place(q));
  if (unsafe) {
    log(`convite de Qigong de ${who} ignorado: ${unsafe}.`);
    return { ok: true };
  }
  log(`aceitando o Qigong de ${who}.`);
  await q("SKIL", ACCEPT_BODY);
  if (!(await waitQigong(q, 15000, who, log))) log(`o Qigong com ${who} nao comecou.`);
  return { ok: true, accepted: s.invite.name };
}

// Uma passada de pedidos, de onde o char estiver.
export async function runQigongRequest(host: string, port: number, log: Log = () => {}, now = Date.now()): Promise<{ ok: boolean; done: number; erro?: string }> {
  const p0 = await queryPlayer(host, port);
  if (!p0.ok) return { ok: false, done: 0, erro: "char nao esta em mundo" };
  if (!readObjv) return { ok: false, done: 0, erro: "sem leitor do OBJV" };
  const q: Query = (tag, body) => sendCommand(host, port, tag, body);
  const skip = qigongSkipNames(asks, now);
  let done = 0;
  for (let i = 0; i < QIGONG_MAX_REQUESTS; i++) {
    await q("SKIL", "calls XGuildMemberDocument ReqMemberList 0");
    await sleep(SERVER_WAIT_MS);
    const s = await readQigongSnapshot(q, true);
    if (!s?.inWorld) return { ok: false, done, erro: "char fora de mundo" };
    if (!s.inGuild) return { ok: true, done, erro: "char sem guilda" };
    if (s.inheriting) return { ok: true, done };
    const m = qigongCandidates(s, skip)[0];
    if (!m) return { ok: true, done };
    skip.add(m.name);
    const unsafe = unsafeReason(await place(q));
    if (unsafe) return { ok: false, done, erro: unsafe };
    if ((await q("OBJV", memberObjvBody(m.index))).ok !== true) continue;
    const uid = uidFromObjv(await readObjv());
    // Lista mudou entre a leitura e o OBJV: confere o nome e os 32 bits de baixo
    // do uid (o GETP le so esses) antes de pedir.
    const low = (await q("GETP", `${memberObjvBody(m.index)} uid`)).int;
    const name = (await q("GETP", `${memberObjvBody(m.index)} name`)).str;
    if (!uid || typeof low !== "number" || name !== m.name || (BigInt(uid) & 0xffffffffn) !== BigInt(low >>> 0)) continue;
    const role = qigongRole(s, m.level) === "student" ? "aluno" : "mestre";
    const who = `${m.name} (Lv.${m.level})`;
    log(`pedindo Qigong a ${who}; o char como ${role}.`);
    const at = Date.now();
    await q("SKIL", requestBody(uid));
    const accepted = await waitQigong(q, QIGONG_INVITE_WAIT_MS, who, log);
    const a = qigongAsked(asks.get(m.name), at, !accepted);
    asks.set(m.name, a);
    saveAsks();
    if (accepted) done++;
    else if (a.misses >= QIGONG_MISSES_PER_DAY) log(`${who} nao aceitou o Qigong (${a.misses}a vez hoje); so pede de novo depois da virada do dia.`);
    else log(`${who} nao aceitou o Qigong; pede de novo em ${Math.round(QIGONG_ASK_AGAIN_MS / 60000)} min.`);
  }
  return { ok: true, done };
}
